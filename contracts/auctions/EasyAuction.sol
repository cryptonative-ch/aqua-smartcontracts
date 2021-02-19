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
        uint96 amountToBuy,
        uint96 amountToBid
    );
    event CancellationOrder(
        uint64 indexed userId,
        uint96 amountToBuy,
        uint96 amountToBid
    );
    event ClaimedFromOrder(
        uint64 indexed userId,
        uint96 amountToBuy,
        uint96 amountToBid
    );
    event NewUser(uint64 indexed userId, address indexed userAddress);
    event InitializedAuction(
        IERC20 indexed _auctioningToken,
        IERC20 indexed _biddingToken,
        uint256 orderCancellationEndDate,
        uint256 gracePeriodStartDate,
        uint256 gracePeriodEndDate,
        uint96 _amountToSell,
        uint96 _minBidAmountToReceive,
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
        uint96 _amountToSell,               // total amount to sell
        uint96 _minBidAmountToReceive,      // Minimum amount of biding token to receive at final point
        uint256 _minimumBiddingAmountPerOrder,
        uint256 _minFundingThreshold,
        uint256 _gracePeriodStartDuration,
        uint256 _gracePeriodDuration,
        bool _isAtomicClosureAllowed
    ) public {
        uint64 userId = getUserId(msg.sender);

        // deposits _amountToSell + fees
        _auctioningToken.safeTransferFrom(
            msg.sender,
            address(this),
            _amountToSell.mul(FEE_DENOMINATOR.add(feeNumerator)).div(
                FEE_DENOMINATOR
            ) //[0]
        );
        require(_amountToSell > 0, "cannot auction zero tokens");
        require(_minBidAmountToReceive > 0, "tokens cannot be auctioned for free");
        require(
            _minimumBiddingAmountPerOrder > 0,
            "minimumBiddingAmountPerOrder is not allowed to be zero"
        );

        gracePeriodStartDate = block.timestamp.add(_gracePeriodStartDuration);
        gracePeriodEndDate = gracePeriodStartDate.add(_gracePeriodDuration);
        uint256 _duration = _gracePeriodStartDuration.add(_gracePeriodDuration);
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
            _amountToSell,
            _minBidAmountToReceive
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
            _amountToSell,
            _minBidAmountToReceive,
            _minimumBiddingAmountPerOrder,
            _minFundingThreshold
        );
    }

    uint256 public constant FEE_DENOMINATOR = 1000;
    uint64 public feeReceiverUserId = 1;

    function placeOrders(
        uint96[] memory _amountsToBuy,
        uint96[] memory _amountsToBid,
        bytes32[] memory _prevOrders
    ) public atStageOrderPlacement() returns (uint64 userId) {
        return _placeOrders(_amountsToBuy, _amountsToBid, _prevOrders);
    }

    function _placeOrders(
        uint96[] memory _amountsToBuy,
        uint96[] memory _amountsToBid,
        bytes32[] memory _prevOrders
    ) internal returns (uint64 userId) {
        (
            ,
            uint96 amountToSell,
            uint96 minAmountToReceive
        ) = initialAuctionOrder.decodeOrder();

        uint256 sumOfAmountsToBid = 0;
        userId = getUserId(msg.sender);
        bytes32 extraInfo = bytes32(0);
        if (block.timestamp > gracePeriodStartDate) {
            extraInfo = IterableOrderedOrderSet.encodeOrder(block.timestamp.sub(gracePeriodStartDate).toUint64(), 0, 0);
        }
        for (uint256 i = 0; i < _amountsToBuy.length; i++) {
            require(
                _amountsToBuy[i].mul(minAmountToReceive) <
                    amountToSell.mul(_amountsToBid[i]),
                "limit price not better than mimimal offer"
            );
            // _orders should have a minimum bid size in order to limit the gas
            // required to compute the final price of the auction.
            require(
                _amountsToBid[i] > minimumBiddingAmountPerOrder,
                "order too small"
            );
            bool success =
                orders.insert(
                    IterableOrderedOrderSet.encodeOrder(
                        userId,
                        _amountsToBuy[i],
                        _amountsToBid[i]
                    ),
                    _prevOrders[i],
                    extraInfo
                );
            if (success) {
                sumOfAmountsToBid = sumOfAmountsToBid.add(_amountsToBid[i]);
                emit NewOrder(userId, _amountsToBuy[i], _amountsToBid[i]);
            }
        }
        biddingToken.safeTransferFrom(
            msg.sender,
            address(this),
            sumOfAmountsToBid
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
                    uint96 amountToBuy,
                    uint96 amountToBid
                ) = _orders[i].decodeOrder();
                require(
                    userIdOfIter == userId,
                    "Only the user can cancel his orders"
                );
                claimableAmount = claimableAmount.add(amountToBid);
                emit CancellationOrder(
                    userId,
                    amountToBuy,
                    amountToBid
                );
            }
        }
        biddingToken.safeTransfer(msg.sender, claimableAmount); //[2]
    }

    function precalculateSellAmountSum(uint256 iterationSteps)
        public
        atStageSolutionSubmission()
    {
        (, uint96 amountToSell,) = initialAuctionOrder.decodeOrder();
        uint256 sumBidAmount = interimSumBidAmount;
        bytes32 iterOrder = interimOrder;

        for (uint256 i = 0; i < iterationSteps; i++) {
            iterOrder = orders.next(iterOrder);
            (, , uint96 amountToBid) = iterOrder.decodeOrder();
            sumBidAmount = sumBidAmount.add(amountToBid);
        }

        require(
            iterOrder != IterableOrderedOrderSet.QUEUE_END,
            "reached end of order list"
        );

        // it is checked that not too many iteration steps were taken:
        // require that the sum of SellAmounts times the price of the last order
        // is not more than initially sold amount
        (, uint96 amountToBuy, uint96 amountToBid) =
            iterOrder.decodeOrder();
        require(
            sumBidAmount.mul(amountToBuy) <
                amountToSell.mul(amountToBid),
            "too many orders summed up"
        );

        interimSumBidAmount = sumBidAmount;
        interimOrder = iterOrder;
    }

    function settleAuctionAtomically(
        uint96[] memory _amountsToBuy,
        uint96[] memory _amountsToBid,
        bytes32[] memory _prevOrder
    ) public atStageSolutionSubmission() {
        require(
            isAtomicClosureAllowed,
            "not allowed to settle auction atomically"
        );
        require(
            _amountsToBuy.length == 1 && _amountsToBid.length == 1,
            "Only one order can be placed atomically"
        );
        uint64 userId = getUserId(msg.sender);
        require(
            interimOrder.smallerThan(
                IterableOrderedOrderSet.encodeOrder(
                    userId,
                    _amountsToBuy[0],
                    _amountsToBid[0]
                )
            ),
            "precalculateSellAmountSum is already too advanced"
        );
        _placeOrders(_amountsToBuy, _amountsToBid, _prevOrder);
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
            uint96 fullAuctionAmountToSell,
            uint96 minBidAmountToReceive
        ) = initialAuctionOrder.decodeOrder();

        uint256 currentBidSum = interimSumBidAmount;
        bytes32 currentOrder = interimOrder;
        bytes32 nextOrder = currentOrder;
        uint256 amountToBuy;
        uint256 amountToBid;
        uint96 fillVolumeOfAuctioneerOrder = fullAuctionAmountToSell;
        uint64 graceDuration = auctionEndDate.sub(gracePeriodStartDate).toUint64();
        // Sum order up, until fullAuctionAmountToSell is fully bought or queue end is reached
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
            (, amountToBuy, amountToBid) = currentOrder.decodeOrder();
            currentBidSum = currentBidSum.add(amountToBid);
        } while (
            currentBidSum.mul(amountToBuy) <
                fullAuctionAmountToSell.mul(amountToBid)
        );

        if (
            currentBidSum > 0 &&
            currentBidSum.mul(amountToBuy) >=
            fullAuctionAmountToSell.mul(amountToBid)
        ) {
            // All considered/summed orders are sufficient to close the auction fully
            // at price between current and previous orders.
            uint256 uncoveredBids =
                currentBidSum.sub(
                    fullAuctionAmountToSell.mul(amountToBid).div(
                        amountToBuy
                    )
                );

            if (amountToBid >= uncoveredBids) {
                //[13]
                // Auction fully filled via partial match of currentOrder
                uint256 amountInClearingOrder =
                    amountToBid.sub(uncoveredBids);
                volumeClearingPriceOrder = amountInClearingOrder.toUint96();
                currentBidSum = currentBidSum.sub(uncoveredBids);
                clearingOrder = currentOrder;
            } else {
                //[14]
                // Auction fully filled via price strictly between currentOrder and the order
                // immediately before. For a proof
                currentBidSum = currentBidSum.sub(amountToBid);
                clearingOrder = IterableOrderedOrderSet.encodeOrder(
                    0,
                    fullAuctionAmountToSell,
                    currentBidSum.toUint96()
                );
            }
        } else {
            // All considered/summed orders are not sufficient to close the auction fully at price of last order //[18]
            // Either a higher price must be used or auction is only partially filled

            if (currentBidSum > minBidAmountToReceive) {
                //[15]
                // Price higher than last order would fill the auction
                clearingOrder = IterableOrderedOrderSet.encodeOrder(
                    0,
                    fullAuctionAmountToSell,
                    currentBidSum.toUint96()
                );
            } else {
                //[16]
                // Even at the initial auction price, the auction is partially filled
                clearingOrder = IterableOrderedOrderSet.encodeOrder(
                    0,
                    fullAuctionAmountToSell,
                    minBidAmountToReceive
                );
                fillVolumeOfAuctioneerOrder = currentBidSum
                    .mul(fullAuctionAmountToSell)
                    .div(minBidAmountToReceive)
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
            fullAuctionAmountToSell
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
            (uint64 userIdOrder, uint96 amountToBuy, uint96 amountToBid) =
                _orders[i].decodeOrder();
            require(
                userIdOrder == userId,
                "only allowed to claim for same user"
            );
            if (minFundingThresholdNotReached) {
                //[10]
                sumBiddingTokenAmount = sumBiddingTokenAmount.add(amountToBid);
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
                        amountToBid.sub(volumeClearingPriceOrder)
                    );
                } else {
                    if (_orders[i].smallerThan(clearingPriceOrder)) {
                        //[17]
                        sumAuctioningTokenAmount = sumAuctioningTokenAmount.add(
                            amountToBid.mul(priceNumerator).div(priceDenominator)
                        );
                    } else {
                        //[24]
                        sumBiddingTokenAmount = sumBiddingTokenAmount.add(
                            amountToBid
                        );
                    }
                }
            }
            emit ClaimedFromOrder(userId, amountToBuy, amountToBid);
        }
        sendOutTokens(sumAuctioningTokenAmount, sumBiddingTokenAmount, userId); //[3]
    }

    function processFeesAndFunds(
        uint256 fillVolumeOfAuctioneerOrder,
        uint64 auctioneerId,
        uint96 fullAuctionAmountToSell
    ) internal {
        uint256 feeAmount =
            fullAuctionAmountToSell.mul(feeNumerator).div(FEE_DENOMINATOR); //[20]
        if (minFundingThresholdNotReached) {
            sendOutTokens(fullAuctionAmountToSell.add(feeAmount), 0, auctioneerId); //[4]
        } else {
            //[11]
            (, uint96 priceNumerator, uint96 priceDenominator) =
                clearingPriceOrder.decodeOrder();
            uint256 unsettledTokens =
                fullAuctionAmountToSell.sub(fillVolumeOfAuctioneerOrder);
            uint256 auctioningTokenAmount =
                unsettledTokens.add(
                    feeAmount.mul(unsettledTokens).div(fullAuctionAmountToSell)
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
                    fullAuctionAmountToSell
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
        if (gracePeriodEndDate <= block.timestamp) {
            return 0;
        }
        return gracePeriodEndDate.sub(block.timestamp);
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
