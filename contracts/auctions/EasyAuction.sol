// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../libraries/IdToAddressBiMap.sol";
import "../libraries/SafeCast.sol";
import "../libraries/IterableOrderedOrderSet.sol";

contract EasyAuction is Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint64;
    using SafeMath for uint96;
    using SafeMath for uint256;
    using SafeCast for uint256;
    using IterableOrderedOrderSet for IterableOrderedOrderSet.Data;
    using IterableOrderedOrderSet for bytes32;
    using IdToAddressBiMap for IdToAddressBiMap.Data;

    modifier atStageOrderPlacement() {
        require(
            block.timestamp < gracePeriodEndDate,
            "no longer in order placement phase"
        );
        _;
    }

    modifier atStageOrderPlacementAndCancelation() {
        require(
            block.timestamp < orderCancellationEndDate || auctionEndDate != 0,
            "no longer in order placement and cancelation phase"
        );
        _;
    }

    modifier atStageSolutionSubmission() {
        {
            uint256 auctionEndDate = auctionEndDate;
            require(
                auctionEndDate != 0 && clearingPriceOrder == bytes32(0),
                "Auction not in solution submission phase"
            );
        }
        _;
    }

    modifier atStageFinished() {
        require(clearingPriceOrder != bytes32(0), "Auction not yet finished");
        _;
    }

    event NewOrder(
        uint64 indexed userId,
        uint96 amountOut,
        uint96 amountIn
    );
    event CancellationOrder(
        uint64 indexed userId,
        uint96 amountOut,
        uint96 amountIn
    );
    event ClaimedFromOrder(
        uint64 indexed userId,
        uint96 amountOut,
        uint96 amountIn
    );
    event NewUser(uint64 indexed userId, address indexed userAddress);
    event InitializedAuction(
        IERC20 indexed _auctioningToken,
        IERC20 indexed _biddingToken,
        uint256 orderCancellationEndDate,
        uint256 gracePeriodStartDate,
        uint256 gracePeriodEndDate,
        uint96 _expectedAmountIn,
        uint96 _expectedAmountOut,
        uint256 minimumBiddingAmountPerOrder,
        uint256 minFundingThreshold
    );
    event AuctionCleared(
        uint96 auctionedTokens,
        uint96 soldBiddingTokens,
        bytes32 clearingOrder
    );
    event UserRegistration(address indexed user, uint64 userId);

    IERC20 public auctioningToken;
    IERC20 public biddingToken;
    uint256 public orderCancellationEndDate;
    uint256 public auctionStartedDate;
    uint256 public auctionEndDate;
    bytes32 public initialAuctionOrder;
    uint256 public minimumBiddingAmountPerOrder;
    uint256 public interimSumBidAmount;
    bytes32 public interimOrder;
    bytes32 public clearingPriceOrder;
    uint96 public volumeClearingPriceOrder;
    bool public minFundingThresholdNotReached;
    bool public isAtomicClosureAllowed;
    uint256 public feeNumerator;
    uint256 public minFundingThreshold;
    uint256 public gracePeriodStartDate;
    uint256 public gracePeriodEndDate;

    IterableOrderedOrderSet.Data internal orders;
    IdToAddressBiMap.Data private registeredUsers;
    uint64 public numUsers;

    constructor() public Ownable() {}

    // @dev: intiate a new auction
    // Warning: In case the auction is expected to raise more than
    // 2^96 units of the biddingToken, don't start the auction, as
    // it will not be settlable. This corresponds to about 79
    // billion DAI.
    //
    // Prices between biddingToken and auctioningToken are expressed by a
    // fraction whose components are stored as uint96.
    function initAuction(
        IERC20 _auctioningToken,
        IERC20 _biddingToken,
        uint256 _orderCancelationPeriodDuration,
        uint96 _expectedAmountIn,
        uint96 _expectedAmountOut,
        uint256 _minimumBiddingAmountPerOrder,
        uint256 _minFundingThreshold,
        uint256 _gracePeriodStartDuration,
        uint256 _gracePeriodDuration,
        bool _isAtomicClosureAllowed
    ) public {
        uint64 userId = getUserId(msg.sender);

        // deposits amountIn + fees
        _auctioningToken.safeTransferFrom(
            msg.sender,
            address(this),
            _expectedAmountIn.mul(FEE_DENOMINATOR.add(feeNumerator)).div(
                FEE_DENOMINATOR
            ) //[0]
        );
        require(_expectedAmountIn > 0, "cannot auction zero tokens");
        require(_expectedAmountOut > 0, "tokens cannot be auctioned for free");
        require(
            _minimumBiddingAmountPerOrder > 0,
            "minimumBiddingAmountPerOrder is not allowed to be zero"
        );

        gracePeriodStartDate = block.timestamp.add(_gracePeriodStartDuration);
        gracePeriodEndDate = gracePeriodStartDate.add(_gracePeriodDuration);
        uint256 _duration = gracePeriodEndDate.sub(block.timestamp);
        require(
            _orderCancelationPeriodDuration <= _duration,
            "time periods are not configured correctly"
        );
        orders.initializeEmptyList();

        uint256 cancellationEndDate =
            block.timestamp + _orderCancelationPeriodDuration;

        auctioningToken = _auctioningToken;
        biddingToken = _biddingToken;
        orderCancellationEndDate = cancellationEndDate;
        auctionStartedDate = block.timestamp;
        auctionEndDate = 0;
        initialAuctionOrder = IterableOrderedOrderSet.encodeOrder(
            userId,
            _expectedAmountOut,
            _expectedAmountIn
        );
        minimumBiddingAmountPerOrder = _minimumBiddingAmountPerOrder;
        interimSumBidAmount = 0;
        interimOrder = IterableOrderedOrderSet.QUEUE_START;
        clearingPriceOrder = bytes32(0);
        volumeClearingPriceOrder = 0;
        minFundingThresholdNotReached = false;
        isAtomicClosureAllowed = _isAtomicClosureAllowed;
        minFundingThreshold = _minFundingThreshold;

        emit InitializedAuction(
            _auctioningToken,
            _biddingToken,
            orderCancellationEndDate,
            gracePeriodStartDate,
            gracePeriodEndDate,
            _expectedAmountIn,
            _expectedAmountOut,
            _minimumBiddingAmountPerOrder,
            _minFundingThreshold
        );
    }

    uint256 public constant FEE_DENOMINATOR = 1000;
    uint64 public feeReceiverUserId = 1;

    function placeOrders(
        uint96[] memory _amountsOut,
        uint96[] memory _amountsIn,
        bytes32[] memory _prevOrders
    ) public atStageOrderPlacement() returns (uint64 userId) {
        return _placeOrders(_amountsOut, _amountsIn, _prevOrders);
    }

    function _placeOrders(
        uint96[] memory _amountsOut,
        uint96[] memory _amountsIn,
        bytes32[] memory _prevOrders
    ) internal returns (uint64 userId) {
        (
            ,
            uint96 amountOutOfInitialAuctionOrder,
            uint96 amountInOfInitialAuctionOrder
        ) = initialAuctionOrder.decodeOrder();

        uint256 sumOfAmountsIn = 0;
        userId = getUserId(msg.sender);
        bytes32 extraInfo = bytes32(0);
        if (block.timestamp > gracePeriodStartDate) {
            extraInfo = IterableOrderedOrderSet.encodeOrder(block.timestamp.sub(gracePeriodStartDate).toUint64(), 0, 0);
        }
        for (uint256 i = 0; i < _amountsOut.length; i++) {
            require(
                _amountsOut[i].mul(amountOutOfInitialAuctionOrder) <
                    amountInOfInitialAuctionOrder.mul(_amountsIn[i]),
                "limit price not better than mimimal offer"
            );
            // _orders should have a minimum bid size in order to limit the gas
            // required to compute the final price of the auction.
            require(
                _amountsIn[i] > minimumBiddingAmountPerOrder,
                "order too small"
            );
            bool success =
                orders.insert(
                    IterableOrderedOrderSet.encodeOrder(
                        userId,
                        _amountsOut[i],
                        _amountsIn[i]
                    ),
                    _prevOrders[i],
                    extraInfo
                );
            if (success) {
                sumOfAmountsIn = sumOfAmountsIn.add(_amountsIn[i]);
                emit NewOrder(userId, _amountsOut[i], _amountsIn[i]);
            }
        }
        biddingToken.safeTransferFrom(
            msg.sender,
            address(this),
            sumOfAmountsIn
        ); //[1]
    }

    function cancelOrders(bytes32[] memory _orders)
        public
        atStageOrderPlacementAndCancelation()
    {
        uint64 userId = getUserId(msg.sender);
        uint256 claimableAmount = 0;
        uint64 graceDuration = auctionEndDate != 0 ? auctionEndDate.sub(gracePeriodStartDate).toUint64() : 0;
        for (uint256 i = 0; i < _orders.length; i++) {
            // Note: we keep the back pointer of the deleted element so that
            // it can be used as a reference point to insert a new node.
            (uint64 periodFromGraceStart, ,) = orders.extraInfo[_orders[i]].decodeOrder();
            require(graceDuration == 0 || periodFromGraceStart > graceDuration, 'Unable to cancel');
            bool success = orders.removeKeepHistory(_orders[i]);
            if (success) {
                (
                    uint64 userIdOfIter,
                    uint96 amountOutOfIter,
                    uint96 amountInOfIter
                ) = _orders[i].decodeOrder();
                require(
                    userIdOfIter == userId,
                    "Only the user can cancel his orders"
                );
                claimableAmount = claimableAmount.add(amountInOfIter);
                emit CancellationOrder(
                    userId,
                    amountOutOfIter,
                    amountInOfIter
                );
            }
        }
        biddingToken.safeTransfer(msg.sender, claimableAmount); //[2]
    }

    function precalculateSellAmountSum(uint256 iterationSteps)
        public
        atStageSolutionSubmission()
    {
        (, , uint96 auctioneerSellAmount) = initialAuctionOrder.decodeOrder();
        uint256 sumBidAmount = interimSumBidAmount;
        bytes32 iterOrder = interimOrder;

        for (uint256 i = 0; i < iterationSteps; i++) {
            iterOrder = orders.next(iterOrder);
            (, , uint96 amountInOfIter) = iterOrder.decodeOrder();
            sumBidAmount = sumBidAmount.add(amountInOfIter);
        }

        require(
            iterOrder != IterableOrderedOrderSet.QUEUE_END,
            "reached end of order list"
        );

        // it is checked that not too many iteration steps were taken:
        // require that the sum of SellAmounts times the price of the last order
        // is not more than initially sold amount
        (, uint96 amountOutOfIter, uint96 amountInOfIter) =
            iterOrder.decodeOrder();
        require(
            sumBidAmount.mul(amountOutOfIter) <
                auctioneerSellAmount.mul(amountInOfIter),
            "too many orders summed up"
        );

        interimSumBidAmount = sumBidAmount;
        interimOrder = iterOrder;
    }

    function settleAuctionAtomically(
        uint96[] memory _amountsOut,
        uint96[] memory _amountsIn,
        bytes32[] memory _prevOrder
    ) public atStageSolutionSubmission() {
        require(
            isAtomicClosureAllowed,
            "not allowed to settle auction atomically"
        );
        require(
            _amountsOut.length == 1 && _amountsIn.length == 1,
            "Only one order can be placed atomically"
        );
        uint64 userId = getUserId(msg.sender);
        require(
            interimOrder.smallerThan(
                IterableOrderedOrderSet.encodeOrder(
                    userId,
                    _amountsOut[0],
                    _amountsIn[0]
                )
            ),
            "precalculateSellAmountSum is already too advanced"
        );
        _placeOrders(_amountsOut, _amountsIn, _prevOrder);
        settleAuction();
    }

    // @dev function settling the auction and calculating the price
    function settleAuction()
        public
        atStageSolutionSubmission()
        returns (bytes32 clearingOrder)
    {
        (
            uint64 auctioneerId,
            uint96 expectedAmountOut,
            uint96 fullAuctionedAmount
        ) = initialAuctionOrder.decodeOrder();

        uint256 currentBidSum = interimSumBidAmount;
        bytes32 currentOrder = interimOrder;
        bytes32 nextOrder = currentOrder;
        uint256 amountOutOfIter;
        uint256 amountInOfIter;
        uint96 fillVolumeOfAuctioneerOrder = fullAuctionedAmount;
        uint64 graceDuration = auctionEndDate.sub(gracePeriodStartDate).toUint64();
        // Sum order up, until fullAuctionedAmount is fully bought or queue end is reached
        do {
            nextOrder = orders.next(nextOrder);
            if (nextOrder == IterableOrderedOrderSet.QUEUE_END) {
                break;
            }
            (uint64 periodFromGraceStart, ,) = orders.extraInfo[nextOrder].decodeOrder();
            if (periodFromGraceStart > graceDuration) {
                continue;
            }
            currentOrder = nextOrder;
            (, amountOutOfIter, amountInOfIter) = currentOrder.decodeOrder();
            currentBidSum = currentBidSum.add(amountInOfIter);
        } while (
            currentBidSum.mul(amountOutOfIter) <
                fullAuctionedAmount.mul(amountInOfIter)
        );

        if (
            currentBidSum > 0 &&
            currentBidSum.mul(amountOutOfIter) >=
            fullAuctionedAmount.mul(amountInOfIter)
        ) {
            // All considered/summed orders are sufficient to close the auction fully
            // at price between current and previous orders.
            uint256 uncoveredBids =
                currentBidSum.sub(
                    fullAuctionedAmount.mul(amountInOfIter).div(
                        amountOutOfIter
                    )
                );

            if (amountInOfIter >= uncoveredBids) {
                //[13]
                // Auction fully filled via partial match of currentOrder
                uint256 amountInClearingOrder =
                    amountInOfIter.sub(uncoveredBids);
                volumeClearingPriceOrder = amountInClearingOrder.toUint96();
                currentBidSum = currentBidSum.sub(uncoveredBids);
                clearingOrder = currentOrder;
            } else {
                //[14]
                // Auction fully filled via price strictly between currentOrder and the order
                // immediately before. For a proof
                currentBidSum = currentBidSum.sub(amountInOfIter);
                clearingOrder = IterableOrderedOrderSet.encodeOrder(
                    0,
                    fullAuctionedAmount,
                    currentBidSum.toUint96()
                );
            }
        } else {
            // All considered/summed orders are not sufficient to close the auction fully at price of last order //[18]
            // Either a higher price must be used or auction is only partially filled

            if (currentBidSum > expectedAmountOut) {
                //[15]
                // Price higher than last order would fill the auction
                clearingOrder = IterableOrderedOrderSet.encodeOrder(
                    0,
                    fullAuctionedAmount,
                    currentBidSum.toUint96()
                );
            } else {
                //[16]
                // Even at the initial auction price, the auction is partially filled
                clearingOrder = IterableOrderedOrderSet.encodeOrder(
                    0,
                    fullAuctionedAmount,
                    expectedAmountOut
                );
                fillVolumeOfAuctioneerOrder = currentBidSum
                    .mul(fullAuctionedAmount)
                    .div(expectedAmountOut)
                    .toUint96();
            }
        }
        clearingPriceOrder = clearingOrder;

        if (minFundingThreshold > currentBidSum) {
            minFundingThresholdNotReached = true;
        }
        processFeesAndFunds(
            fillVolumeOfAuctioneerOrder,
            auctioneerId,
            fullAuctionedAmount
        );
        emit AuctionCleared(
            fillVolumeOfAuctioneerOrder,
            uint96(currentBidSum),
            clearingOrder
        );
        // Gas refunds
        initialAuctionOrder = bytes32(0);
        interimOrder = bytes32(0);
        interimSumBidAmount = uint256(0);
        minimumBiddingAmountPerOrder = uint256(0);
    }

    function claimFromParticipantOrder(bytes32[] memory _orders)
        public
        atStageFinished()
        returns (
            uint256 sumAuctioningTokenAmount,
            uint256 sumBiddingTokenAmount
        )
    {
        for (uint256 i = 0; i < _orders.length; i++) {
            // Note: we don't need to keep any information about the node since
            // no new elements need to be inserted.
            require(
                orders.remove(_orders[i]),
                "order is no longer claimable"
            );
        }
        (, uint96 priceNumerator, uint96 priceDenominator) =
            clearingPriceOrder.decodeOrder();
        (uint64 userId, , ) = _orders[0].decodeOrder();
        for (uint256 i = 0; i < _orders.length; i++) {
            (uint64 userIdOrder, uint96 amountOut, uint96 amountIn) =
                _orders[i].decodeOrder();
            require(
                userIdOrder == userId,
                "only allowed to claim for same user"
            );
            if (minFundingThresholdNotReached) {
                //[10]
                sumBiddingTokenAmount = sumBiddingTokenAmount.add(amountIn);
            } else {
                //[23]
                if (_orders[i] == clearingPriceOrder) {
                    //[25]
                    sumAuctioningTokenAmount = sumAuctioningTokenAmount.add(
                        volumeClearingPriceOrder.mul(priceNumerator).div(
                            priceDenominator
                        )
                    );
                    sumBiddingTokenAmount = sumBiddingTokenAmount.add(
                        amountIn.sub(volumeClearingPriceOrder)
                    );
                } else {
                    if (_orders[i].smallerThan(clearingPriceOrder)) {
                        //[17]
                        sumAuctioningTokenAmount = sumAuctioningTokenAmount.add(
                            amountIn.mul(priceNumerator).div(priceDenominator)
                        );
                    } else {
                        //[24]
                        sumBiddingTokenAmount = sumBiddingTokenAmount.add(
                            amountIn
                        );
                    }
                }
            }
            emit ClaimedFromOrder(userId, amountOut, amountIn);
        }
        sendOutTokens(sumAuctioningTokenAmount, sumBiddingTokenAmount, userId); //[3]
    }

    function processFeesAndFunds(
        uint256 fillVolumeOfAuctioneerOrder,
        uint64 auctioneerId,
        uint96 fullAuctionedAmount
    ) internal {
        uint256 feeAmount =
            fullAuctionedAmount.mul(feeNumerator).div(FEE_DENOMINATOR); //[20]
        if (minFundingThresholdNotReached) {
            sendOutTokens(fullAuctionedAmount.add(feeAmount), 0, auctioneerId); //[4]
        } else {
            //[11]
            (, uint96 priceNumerator, uint96 priceDenominator) =
                clearingPriceOrder.decodeOrder();
            uint256 unsettledTokens =
                fullAuctionedAmount.sub(fillVolumeOfAuctioneerOrder);
            uint256 auctioningTokenAmount =
                unsettledTokens.add(
                    feeAmount.mul(unsettledTokens).div(fullAuctionedAmount)
                );
            uint256 biddingTokenAmount =
                fillVolumeOfAuctioneerOrder.mul(priceDenominator).div(
                    priceNumerator
                );
            sendOutTokens(
                auctioningTokenAmount,
                biddingTokenAmount,
                auctioneerId
            ); //[5]
            sendOutTokens(
                feeAmount.mul(fillVolumeOfAuctioneerOrder).div(
                    fullAuctionedAmount
                ),
                0,
                feeReceiverUserId
            ); //[7]
        }
    }

    function sendOutTokens(
        uint256 auctioningTokenAmount,
        uint256 biddingTokenAmount,
        uint64 userId
    ) internal {
        address userAddress = registeredUsers.getAddressAt(userId);
        if (auctioningTokenAmount > 0) {
            auctioningToken.safeTransfer(userAddress, auctioningTokenAmount);
        }
        if (biddingTokenAmount > 0) {
            biddingToken.safeTransfer(userAddress, biddingTokenAmount);
        }
    }

    function registerUser(address user) public returns (uint64 userId) {
        numUsers = numUsers.add(1).toUint64();
        require(
            registeredUsers.insert(numUsers, user),
            "User already registered"
        );
        userId = numUsers;
        emit UserRegistration(user, userId);
    }

    function getUserId(address user) public returns (uint64 userId) {
        if (registeredUsers.hasAddress(user)) {
            userId = registeredUsers.getId(user);
        } else {
            userId = registerUser(user);
            emit NewUser(userId, user);
        }
    }

    function getSecondsRemainingInBatch() public view returns (uint256) {
        if (auctionEndDate < block.timestamp) {
            return 0;
        }
        return auctionEndDate.sub(block.timestamp);
    }

    function containsOrder(bytes32 _order) public view returns (bool) {
        return orders.contains(_order);
    }

    function setAuctionEndDate(uint256 _auctionEndDate) external {
        require(auctionEndDate == 0, "auction end date already set");
        require(block.timestamp >= gracePeriodEndDate, "cannot set auctionEndDate during grace period");
        require(_auctionEndDate >= gracePeriodStartDate && _auctionEndDate <= gracePeriodEndDate, "auctionEndDate must be between grace period");
        auctionEndDate = _auctionEndDate;
    }
}
