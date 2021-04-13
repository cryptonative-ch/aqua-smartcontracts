// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../shared/libraries/IdToAddressBiMap.sol";
import "../shared/libraries/SafeCast.sol";
import "../shared/libraries/IterableOrderedOrderSet.sol";

contract FairSale {
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
            block.timestamp < endDate,
            "no longer in order placement phase"
        );
        _;
    }

    modifier atStageOrderPlacementAndCancelation() {
        require(
            block.timestamp < orderCancellationEndDate,
            "no longer in order placement and cancelation phase"
        );
        _;
    }

    modifier atStageSolutionSubmission() {
        {
            uint256 endDate = endDate;
            require(
                block.timestamp >= endDate && clearingPriceOrder == bytes32(0),
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
        uint64 indexed ownerId,
        uint96 orderTokenOut,
        uint96 orderTokenIn
    );
    event CancellationOrder(
        uint64 indexed ownerId,
        uint96 orderTokenOut,
        uint96 orderTokenIn
    );
    event ClaimedFromOrder(
        uint64 indexed ownerId,
        uint96 orderTokenOut,
        uint96 orderTokenIn
    );
    event NewUser(uint64 indexed ownerId, address indexed userAddress);
    event InitializedSale(
        IERC20 indexed _tokenIn,
        IERC20 indexed _tokenOut,
        uint256 orderCancellationEndDate,
        uint256 endDate,
        uint96 _totalTokenOutAmount,
        uint96 _minBidAmountToReceive,
        uint256 minimumBiddingAmountPerOrder,
        uint256 minSellThreshold
    );
    event SaleCleared(
        uint96 auctionedTokens,
        uint96 soldBiddingTokens,
        bytes32 clearingOrder
    );
    event UserRegistration(address indexed user, uint64 ownerId);

    string public constant templateName = "FairSale";
    IERC20 public tokenIn;
    IERC20 public tokenOut;
    uint256 public orderCancellationEndDate;
    uint256 public auctionStartedDate;
    uint256 public endDate;
    bytes32 public initialAuctionOrder;
    uint256 public minimumBiddingAmountPerOrder;
    uint256 public interimSumBidAmount;
    bytes32 public interimOrder;
    bytes32 public clearingPriceOrder;
    uint96 public volumeClearingPriceOrder;
    bool public minSellThresholdNotReached;
    bool public isAtomicClosureAllowed;
    uint256 public feeNumerator;
    uint256 public minSellThreshold;

    IterableOrderedOrderSet.Data internal orders;
    IdToAddressBiMap.Data private registeredUsers;
    uint64 public numUsers;

    constructor() public {}

    /// @dev internal setup function to initialize the template, called by init()
    ///
    /// Warning: In case the auction is expected to raise more than
    /// 2^96 units of the tokenIn, don't start the auction, as
    /// it will not be settlable. This corresponds to about 79
    /// billion DAI.
    ///
    /// Prices between tokenIn and tokenOut are expressed by a
    /// fraction whose components are stored as uint96.
    ///
    /// @param _tokenIn token to make the bid in
    /// @param _tokenOut token to buy
    /// @param _orderCancelationPeriodDuration cancel order is allowed, but only during this duration
    /// @param _duration amount of tokens to be sold
    /// @param _totalTokenOutAmount total amount to sell
    /// @param _minBidAmountToReceive Minimum amount of biding token to receive at final point
    /// @param _minimumBiddingAmountPerOrder to limit number of orders to reduce gas cost for settelment
    /// @param _minSellThreshold for the sale, otherwise sale will not happen
    /// @param _isAtomicClosureAllowed allow atomic closer of the sale
    function initSale(
        IERC20 _tokenIn,
        IERC20 _tokenOut,
        uint256 _orderCancelationPeriodDuration,
        uint256 _duration,
        uint96 _totalTokenOutAmount,
        uint96 _minBidAmountToReceive,
        uint256 _minimumBiddingAmountPerOrder,
        uint256 _minSellThreshold,
        bool _isAtomicClosureAllowed
    ) internal {
        uint64 auctioneerId = getUserId(msg.sender);

        // deposits _totalTokenOutAmount + fees
        _tokenOut.safeTransferFrom(
            msg.sender,
            address(this),
            _totalTokenOutAmount.mul(FEE_DENOMINATOR.add(feeNumerator)).div(
                FEE_DENOMINATOR
            ) //[0]
        );
        require(_totalTokenOutAmount > 0, "cannot auction zero tokens");
        require(
            _minBidAmountToReceive > 0,
            "tokens cannot be auctioned for free"
        );
        require(
            _minimumBiddingAmountPerOrder > 0,
            "minimumBiddingAmountPerOrder is not allowed to be zero"
        );

        orders.initializeEmptyList();

        uint256 cancellationEndDate =
            block.timestamp + _orderCancelationPeriodDuration;

        endDate = block.timestamp + _duration;

        tokenIn = _tokenIn;
        tokenOut = _tokenOut;
        orderCancellationEndDate = cancellationEndDate;
        auctionStartedDate = block.timestamp;

        initialAuctionOrder = IterableOrderedOrderSet.encodeOrder(
            auctioneerId,
            _totalTokenOutAmount,
            _minBidAmountToReceive
        );
        minimumBiddingAmountPerOrder = _minimumBiddingAmountPerOrder;
        interimSumBidAmount = 0;
        interimOrder = IterableOrderedOrderSet.QUEUE_START;
        clearingPriceOrder = bytes32(0);
        volumeClearingPriceOrder = 0;
        minSellThresholdNotReached = false;
        isAtomicClosureAllowed = _isAtomicClosureAllowed;
        minSellThreshold = _minSellThreshold;

        emit InitializedSale(
            _tokenIn,
            _tokenOut,
            orderCancellationEndDate,
            endDate,
            _totalTokenOutAmount,
            _minBidAmountToReceive,
            _minimumBiddingAmountPerOrder,
            _minSellThreshold
        );
    }

    uint256 public constant FEE_DENOMINATOR = 1000;
    uint64 public feeReceiverUserId = 1;

    /// @dev public function to set orders as a list
    /// @param _ordersTokenOut uint96[] a list of orders, the tokenOut part
    /// @param _ordersTokenIn uint96[] a list of orders, the tokenIn part
    /// @param _prevOrders uint96[] a list of previous orders
    /// @return ownerId uint64
    function placeOrders(
        uint96[] memory _ordersTokenOut,
        uint96[] memory _ordersTokenIn,
        bytes32[] memory _prevOrders
    ) public atStageOrderPlacement() returns (uint64 ownerId) {
        return _placeOrders(_ordersTokenOut, _ordersTokenIn, _prevOrders);
    }

    /// @dev internale function to set orders as a list
    /// @param _ordersTokenOut uint96[] a list of orders, the tokenOut part
    /// @param _ordersTokenIn uint96[] a list of orders, the tokenIn part
    /// @param _prevOrders uint96[] a list of previous orders
    function _placeOrders(
        uint96[] memory _ordersTokenOut,
        uint96[] memory _ordersTokenIn,
        bytes32[] memory _prevOrders
    ) internal returns (uint64 ownerId) {
        (, uint96 totalTokenOutAmount, uint96 minAmountToReceive) =
            initialAuctionOrder.decodeOrder();

        uint256 sumOrdersTokenIn = 0;
        ownerId = getUserId(msg.sender);
        for (uint256 i = 0; i < _ordersTokenOut.length; i++) {
            require(
                _ordersTokenOut[i].mul(minAmountToReceive) <
                    totalTokenOutAmount.mul(_ordersTokenIn[i]),
                "limit price not better than mimimal offer"
            );
            // _orders should have a minimum bid size in order to limit the gas
            // required to compute the final price of the auction.
            require(
                _ordersTokenIn[i] > minimumBiddingAmountPerOrder,
                "order too small"
            );
            bool success =
                orders.insert(
                    IterableOrderedOrderSet.encodeOrder(
                        ownerId,
                        _ordersTokenOut[i],
                        _ordersTokenIn[i]
                    ),
                    _prevOrders[i]
                );
            if (success) {
                sumOrdersTokenIn = sumOrdersTokenIn.add(_ordersTokenIn[i]);
                emit NewOrder(ownerId, _ordersTokenOut[i], _ordersTokenIn[i]);
            }
        }
        tokenIn.safeTransferFrom(msg.sender, address(this), sumOrdersTokenIn); //[1]
    }

    /// @dev cancel orders: will widthdraw tokenIn used in the order
    /// @param _orders bytes32[] a list of orders to cancel
    function cancelOrders(bytes32[] memory _orders)
        public
        atStageOrderPlacementAndCancelation()
    {
        uint64 ownerId = getUserId(msg.sender);
        uint256 claimableAmount = 0;
        for (uint256 i = 0; i < _orders.length; i++) {
            // Note: we keep the back pointer of the deleted element so that
            // it can be used as a reference point to insert a new node.
            bool success = orders.removeKeepHistory(_orders[i]);
            if (success) {
                (
                    uint64 ownerIdOfIter,
                    uint96 orderTokenOut,
                    uint96 orderTokenIn
                ) = _orders[i].decodeOrder();
                require(
                    ownerIdOfIter == ownerId,
                    "Only the user can cancel his orders"
                );
                claimableAmount = claimableAmount.add(orderTokenIn);
                emit CancellationOrder(ownerId, orderTokenOut, orderTokenIn);
            }
        }
        tokenIn.safeTransfer(msg.sender, claimableAmount); //[2]
    }

    /// @param iterationSteps uint256
    function precalculateSellAmountSum(uint256 iterationSteps)
        public
        atStageSolutionSubmission()
    {
        (, uint96 totalTokenOutAmount, ) = initialAuctionOrder.decodeOrder();
        uint256 sumBidAmount = interimSumBidAmount;
        bytes32 iterOrder = interimOrder;

        for (uint256 i = 0; i < iterationSteps; i++) {
            iterOrder = orders.next(iterOrder);
            (, , uint96 orderTokenIn) = iterOrder.decodeOrder();
            sumBidAmount = sumBidAmount.add(orderTokenIn);
        }

        require(
            iterOrder != IterableOrderedOrderSet.QUEUE_END,
            "reached end of order list"
        );

        // it is checked that not too many iteration steps were taken:
        // require that the sum of SellAmounts times the price of the last order
        // is not more than initially sold amount
        (, uint96 orderTokenOut, uint96 orderTokenIn) = iterOrder.decodeOrder();
        require(
            sumBidAmount.mul(orderTokenOut) <
                totalTokenOutAmount.mul(orderTokenIn),
            "too many orders summed up"
        );

        interimSumBidAmount = sumBidAmount;
        interimOrder = iterOrder;
    }

    /// @dev function settling the auction and calculating the price if only one bid is made
    /// @param _ordersTokenOut uint96[]  order which is at clearing price
    /// @param _ordersTokenOut uint96[]  order which is at clearing price
    /// @param _prevOrder uint96[]  order which is at clearing price
    function settleAuctionAtomically(
        uint96[] memory _ordersTokenOut,
        uint96[] memory _ordersTokenIn,
        bytes32[] memory _prevOrder
    ) public atStageSolutionSubmission() {
        require(
            isAtomicClosureAllowed,
            "not allowed to settle auction atomically"
        );
        require(
            _ordersTokenOut.length == 1 && _ordersTokenIn.length == 1,
            "Only one order can be placed atomically"
        );
        uint64 ownerId = getUserId(msg.sender);
        require(
            interimOrder.smallerThan(
                IterableOrderedOrderSet.encodeOrder(
                    ownerId,
                    _ordersTokenOut[0],
                    _ordersTokenIn[0]
                )
            ),
            "precalculateSellAmountSum is already too advanced"
        );
        _placeOrders(_ordersTokenOut, _ordersTokenIn, _prevOrder);
        settleAuction();
    }

    /// @dev function settling the auction and calculating the price
    /// @return clearingOrder bytes32 order which is at clearing price
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
        uint256 orderTokenOut;
        uint256 orderTokenIn;
        uint96 fillVolumeOfAuctioneerOrder = fullAuctionAmountToSell;
        // Sum order up, until fullAuctionAmountToSell is fully bought or queue end is reached
        do {
            nextOrder = orders.next(nextOrder);
            if (nextOrder == IterableOrderedOrderSet.QUEUE_END) {
                break;
            }
            currentOrder = nextOrder;
            (, orderTokenOut, orderTokenIn) = currentOrder.decodeOrder();
            currentBidSum = currentBidSum.add(orderTokenIn);
        } while (
            currentBidSum.mul(orderTokenOut) <
                fullAuctionAmountToSell.mul(orderTokenIn)
        );

        if (
            currentBidSum > 0 &&
            currentBidSum.mul(orderTokenOut) >=
            fullAuctionAmountToSell.mul(orderTokenIn)
        ) {
            // All considered/summed orders are sufficient to close the auction fully
            // at price between current and previous orders.
            uint256 uncoveredBids =
                currentBidSum.sub(
                    fullAuctionAmountToSell.mul(orderTokenIn).div(orderTokenOut)
                );

            if (orderTokenIn >= uncoveredBids) {
                //[13]
                // Auction fully filled via partial match of currentOrder
                uint256 amountInClearingOrder = orderTokenIn.sub(uncoveredBids);
                volumeClearingPriceOrder = amountInClearingOrder.toUint96();
                currentBidSum = currentBidSum.sub(uncoveredBids);
                clearingOrder = currentOrder;
            } else {
                //[14]
                // Auction fully filled via price strictly between currentOrder and the order
                // immediately before. For a proof
                currentBidSum = currentBidSum.sub(orderTokenIn);
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

        if (minSellThreshold > currentBidSum) {
            minSellThresholdNotReached = true;
        }
        processFeesAndFunds(
            fillVolumeOfAuctioneerOrder,
            auctioneerId,
            fullAuctionAmountToSell
        );
        emit SaleCleared(
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

    /// @dev claim the bought tokenOut and get the change back in tokenIn  after sale is over
    /// @param _orders bytes32[] a list of orders to cancel
    /// @return sumTokenOutAmount uint256, sumTokenInAmount uint256
    function claimFromParticipantOrder(bytes32[] memory _orders)
        public
        atStageFinished()
        returns (uint256 sumTokenOutAmount, uint256 sumTokenInAmount)
    {
        for (uint256 i = 0; i < _orders.length; i++) {
            // Note: we don't need to keep any information about the node since
            // no new elements need to be inserted.
            require(orders.remove(_orders[i]), "order is no longer claimable");
        }
        (, uint96 priceNumerator, uint96 priceDenominator) =
            clearingPriceOrder.decodeOrder();
        (uint64 ownerId, , ) = _orders[0].decodeOrder();
        for (uint256 i = 0; i < _orders.length; i++) {
            (uint64 ownerIdOrder, uint96 orderTokenOut, uint96 orderTokenIn) =
                _orders[i].decodeOrder();
            require(
                ownerIdOrder == ownerId,
                "only allowed to claim for same user"
            );
            if (minSellThresholdNotReached) {
                //[10]
                sumTokenInAmount = sumTokenInAmount.add(orderTokenIn);
            } else {
                //[23]
                if (_orders[i] == clearingPriceOrder) {
                    //[25]
                    sumTokenOutAmount = sumTokenOutAmount.add(
                        volumeClearingPriceOrder.mul(priceNumerator).div(
                            priceDenominator
                        )
                    );
                    sumTokenInAmount = sumTokenInAmount.add(
                        orderTokenIn.sub(volumeClearingPriceOrder)
                    );
                } else {
                    if (_orders[i].smallerThan(clearingPriceOrder)) {
                        //[17]
                        sumTokenOutAmount = sumTokenOutAmount.add(
                            orderTokenIn.mul(priceNumerator).div(
                                priceDenominator
                            )
                        );
                    } else {
                        //[24]
                        sumTokenInAmount = sumTokenInAmount.add(orderTokenIn);
                    }
                }
            }
            emit ClaimedFromOrder(ownerId, orderTokenOut, orderTokenIn);
        }
        sendOutTokens(sumTokenOutAmount, sumTokenInAmount, ownerId); //[3]
    }

    /// @dev processes funds and fees after the sale finished
    /// @param fillVolumeOfAuctioneerOrder uint256
    /// @param auctioneerId uint64 id of the address who did initiate the sale
    /// @param fullAuctionAmountToSell uint96
    function processFeesAndFunds(
        uint256 fillVolumeOfAuctioneerOrder,
        uint64 auctioneerId,
        uint96 fullAuctionAmountToSell
    ) internal {
        uint256 feeAmount =
            fullAuctionAmountToSell.mul(feeNumerator).div(FEE_DENOMINATOR); //[20]
        if (minSellThresholdNotReached) {
            sendOutTokens(
                fullAuctionAmountToSell.add(feeAmount),
                0,
                auctioneerId
            ); //[4]
        } else {
            //[11]
            (, uint96 priceNumerator, uint96 priceDenominator) =
                clearingPriceOrder.decodeOrder();
            uint256 unsettledTokens =
                fullAuctionAmountToSell.sub(fillVolumeOfAuctioneerOrder);
            uint256 tokenOutAmount =
                unsettledTokens.add(
                    feeAmount.mul(unsettledTokens).div(fullAuctionAmountToSell)
                );
            uint256 tokenInAmount =
                fillVolumeOfAuctioneerOrder.mul(priceDenominator).div(
                    priceNumerator
                );
            sendOutTokens(tokenOutAmount, tokenInAmount, auctioneerId); //[5]
            sendOutTokens(
                feeAmount.mul(fillVolumeOfAuctioneerOrder).div(
                    fullAuctionAmountToSell
                ),
                0,
                feeReceiverUserId
            ); //[7]
        }
    }

    /// @dev send tokenOut and tokenIn
    /// @param tokenOutAmount uint256 amount of tokenOut to send
    /// @param tokenInAmount uint256 amount of tokenIn to send
    /// @param ownerId uint64 id of address of owner
    function sendOutTokens(
        uint256 tokenOutAmount,
        uint256 tokenInAmount,
        uint64 ownerId
    ) internal {
        address userAddress = registeredUsers.getAddressAt(ownerId);
        if (tokenOutAmount > 0) {
            tokenOut.safeTransfer(userAddress, tokenOutAmount);
        }
        if (tokenInAmount > 0) {
            tokenIn.safeTransfer(userAddress, tokenInAmount);
        }
    }

    /// @dev add address to ownerId/address mapping
    /// @param user address of a account making a bid
    /// @return ownerId uint64 id of address of owner
    function registerUser(address user) public returns (uint64 ownerId) {
        numUsers = numUsers.add(1).toUint64();
        require(
            registeredUsers.insert(numUsers, user),
            "User already registered"
        );
        ownerId = numUsers;
        emit UserRegistration(user, ownerId);
    }

    /// @dev get address from ownerId/address mapping
    /// @param user address
    /// @return ownerId uint64 id of address of owner
    function getUserId(address user) public returns (uint64 ownerId) {
        if (registeredUsers.hasAddress(user)) {
            ownerId = registeredUsers.getId(user);
        } else {
            ownerId = registerUser(user);
            emit NewUser(ownerId, user);
        }
    }

    /// @dev read how much time is left until sale is over
    /// @return uint256 seconds until end
    function getSecondsRemainingInBatch() public view returns (uint256) {
        if (endDate <= block.timestamp) {
            return 0;
        }
        return endDate.sub(block.timestamp);
    }

    /// @dev test if order is present
    /// @param _order bytes32
    /// @return bool
    function containsOrder(bytes32 _order) public view returns (bool) {
        return orders.contains(_order);
    }

    function init(bytes calldata _data) public {
        (
            IERC20 _tokenIn,
            IERC20 _tokenOut,
            uint256 _orderCancelationPeriodDuration,
            uint256 _duration,
            uint96 _totalTokenOutAmount,
            uint96 _minBidAmountToReceive,
            uint256 _minimumBiddingAmountPerOrder,
            uint256 _minSellThreshold,
            bool _isAtomicClosureAllowed
        ) =
            abi.decode(
                _data,
                (
                    IERC20,
                    IERC20,
                    uint256,
                    uint256,
                    uint96,
                    uint96,
                    uint256,
                    uint256,
                    bool
                )
            );

        initSale(
            _tokenIn,
            _tokenOut,
            _orderCancelationPeriodDuration,
            _duration,
            _totalTokenOutAmount,
            _minBidAmountToReceive,
            _minimumBiddingAmountPerOrder,
            _minSellThreshold,
            _isAtomicClosureAllowed
        );
    }
}
