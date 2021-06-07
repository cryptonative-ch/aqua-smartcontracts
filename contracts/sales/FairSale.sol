pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../shared/libraries/IterableOrderedOrderSet.sol";
import "../shared/libraries/IdToAddressBiMap.sol";
import "../shared/libraries/SafeCast.sol";

contract FairSale {
    using SafeERC20 for IERC20;
    using SafeMath for uint64;
    using SafeMath for uint96;
    using SafeMath for uint256;
    using SafeCast for uint256;
    using IterableOrderedOrderSet for IterableOrderedOrderSet.Data;
    using IterableOrderedOrderSet for bytes32;
    using IdToAddressBiMap for IdToAddressBiMap.Data;

    modifier notInitialized() {
        require(!initialized, "already initialized");
        _;
    }

    modifier onlyDeployer {
        require(msg.sender == deployer, "FixedPriceSale: FORBIDDEN");
        _;
    }

    modifier atStageOrderPlacement() {
        require(
            block.timestamp < auctionEndDate,
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
            uint256 auctionEndDate = auctionEndDate;
            require(
                auctionEndDate != 0 &&
                    block.timestamp >= auctionEndDate &&
                    clearingPriceOrder == bytes32(0),
                "Auction not in solution submission phase"
            );
        }
        _;
    }

    modifier atStageFinished() {
        require(clearingPriceOrder != bytes32(0), "Auction not yet finished");
        _;
    }

    event NewSellOrder(
        uint64 indexed userId,
        uint96 buyAmount,
        uint96 sellAmount
    );
    event CancellationSellOrder(
        uint64 indexed userId,
        uint96 buyAmount,
        uint96 sellAmount
    );
    event ClaimedFromOrder(
        uint64 indexed userId,
        uint96 buyAmount,
        uint96 sellAmount
    );
    event NewUser(uint64 indexed userId, address indexed userAddress);
    event AuctionInitialized(
        IERC20 indexed tokenOut,
        IERC20 indexed tokenIn,
        uint256 orderCancellationEndDate,
        uint256 auctionEndDate,
        uint64 userId,
        uint96 auctionedSellAmount,
        uint96 minBuyAmount,
        uint256 minimumBiddingAmountPerOrder,
        uint256 minFundingThreshold
    );
    event AuctionCleared(
        uint96 soldTokenOuts,
        uint96 soldTokenIns,
        bytes32 clearingPriceOrder
    );
    event UserRegistration(address indexed user, uint64 userId);

    string public constant TEMPLATE_NAME = "FairSale";
    address private deployer;
    IERC20 public tokenOut;
    IERC20 public tokenIn;
    uint256 public orderCancellationEndDate;
    uint256 public auctionEndDate;
    bytes32 public initialAuctionOrder;
    uint256 public minimumBiddingAmountPerOrder;
    uint256 public interimSumBidAmount;
    bytes32 public interimOrder;
    bytes32 public clearingPriceOrder;
    uint96 public volumeClearingPriceOrder;
    bool public minFundingThresholdNotReached;
    bool public isAtomicClosureAllowed;
    uint256 public minFundingThreshold;
    IterableOrderedOrderSet.Data internal sellOrders;
    bool public initialized;

    IdToAddressBiMap.Data private registeredUsers;
    uint64 public numUsers;

    constructor() public {
        deployer = msg.sender;
    }

    // @dev: function to intiate a new auction
    // Warning: In case the auction is expected to raise more than
    // 2^96 units of the tokenIn, don't start the auction, as
    // it will not be settlable. This corresponds to about 79
    // billion DAI.
    //
    // Prices between tokenIn and tokenOut are expressed by a
    // fraction whose components are stored as uint96.
    function initAuction(
        IERC20 _tokenIn,
        IERC20 _tokenOut,
        uint256 _orderCancellationEndDate,
        uint256 _auctionEndDate,
        uint96 _auctionedSellAmount,
        uint96 _minBuyAmount,
        uint256 _minimumBiddingAmountPerOrder,
        uint256 _minFundingThreshold,
        bool _isAtomicClosureAllowed
    ) internal {
        // withdraws sellAmount
        initialized = true;
        _tokenOut.safeTransferFrom(
            msg.sender,
            address(this),
            _auctionedSellAmount //[0]
        );
        require(_auctionedSellAmount > 0, "cannot auction zero tokens");
        require(_minBuyAmount > 0, "tokens cannot be auctioned for free");
        require(
            _minimumBiddingAmountPerOrder > 0,
            "minimumBiddingAmountPerOrder is not allowed to be zero"
        );
        require(
            _orderCancellationEndDate <= _auctionEndDate,
            "time periods are not configured correctly"
        );
        require(
            _auctionEndDate > block.timestamp,
            "auction end date must be in the future"
        );
        sellOrders.initializeEmptyList();
        uint64 userId = getUserId(msg.sender);

        tokenOut = _tokenOut;
        tokenIn = _tokenIn;
        orderCancellationEndDate = _orderCancellationEndDate;
        auctionEndDate = _auctionEndDate;
        initialAuctionOrder = IterableOrderedOrderSet.encodeOrder(
            userId,
            _minBuyAmount,
            _auctionedSellAmount
        );
        minimumBiddingAmountPerOrder = _minimumBiddingAmountPerOrder;
        interimSumBidAmount = 0;
        interimOrder = IterableOrderedOrderSet.QUEUE_START;
        clearingPriceOrder = bytes32(0);
        volumeClearingPriceOrder = 0;
        minFundingThresholdNotReached = false;
        isAtomicClosureAllowed = _isAtomicClosureAllowed;
        minFundingThreshold = _minFundingThreshold;

        emit AuctionInitialized(
            _tokenOut,
            _tokenIn,
            _orderCancellationEndDate,
            _auctionEndDate,
            userId,
            _auctionedSellAmount,
            _minBuyAmount,
            _minimumBiddingAmountPerOrder,
            _minFundingThreshold
        );
    }

    function placeSellOrders(
        uint96[] memory _minBuyAmounts,
        uint96[] memory _sellAmounts,
        bytes32[] memory _prevSellOrders
    ) external atStageOrderPlacement returns (uint64 userId) {
        return
            _placeSellOrders(
                _minBuyAmounts,
                _sellAmounts,
                _prevSellOrders,
                msg.sender
            );
    }

    function placeSellOrdersOnBehalf(
        uint96[] memory _minBuyAmounts,
        uint96[] memory _sellAmounts,
        bytes32[] memory _prevSellOrders,
        address orderSubmitter
    ) external atStageOrderPlacement returns (uint64 userId) {
        return
            _placeSellOrders(
                _minBuyAmounts,
                _sellAmounts,
                _prevSellOrders,
                orderSubmitter
            );
    }

    function _placeSellOrders(
        uint96[] memory _minBuyAmounts,
        uint96[] memory _sellAmounts,
        bytes32[] memory _prevSellOrders,
        address orderSubmitter
    ) internal returns (uint64 userId) {
        {
            (
                ,
                uint96 buyAmountOfInitialAuctionOrder,
                uint96 sellAmountOfInitialAuctionOrder
            ) = initialAuctionOrder.decodeOrder();
            for (uint256 i = 0; i < _minBuyAmounts.length; i++) {
                require(
                    _minBuyAmounts[i].mul(buyAmountOfInitialAuctionOrder) <
                        sellAmountOfInitialAuctionOrder.mul(_sellAmounts[i]),
                    "limit price not better than mimimal offer"
                );
            }
        }
        uint256 sumOfSellAmounts = 0;
        userId = getUserId(orderSubmitter);
        for (uint256 i = 0; i < _minBuyAmounts.length; i++) {
            require(
                _minBuyAmounts[i] > 0,
                "_minBuyAmounts must be greater than 0"
            );
            // orders should have a minimum bid size in order to limit the gas
            // required to compute the final price of the auction.
            require(
                _sellAmounts[i] > minimumBiddingAmountPerOrder,
                "order too small"
            );
            if (
                sellOrders.insert(
                    IterableOrderedOrderSet.encodeOrder(
                        userId,
                        _minBuyAmounts[i],
                        _sellAmounts[i]
                    ),
                    _prevSellOrders[i]
                )
            ) {
                sumOfSellAmounts = sumOfSellAmounts.add(_sellAmounts[i]);
                emit NewSellOrder(userId, _minBuyAmounts[i], _sellAmounts[i]);
            }
        }
        tokenIn.safeTransferFrom(msg.sender, address(this), sumOfSellAmounts); //[1]
    }

    function cancelSellOrders(bytes32[] memory _sellOrders)
        public
        atStageOrderPlacementAndCancelation
    {
        uint64 userId = getUserId(msg.sender);
        uint256 claimableAmount = 0;
        for (uint256 i = 0; i < _sellOrders.length; i++) {
            // Note: we keep the back pointer of the deleted element so that
            // it can be used as a reference point to insert a new node.
            bool success = sellOrders.removeKeepHistory(_sellOrders[i]);
            if (success) {
                (
                    uint64 userIdOfIter,
                    uint96 buyAmountOfIter,
                    uint96 sellAmountOfIter
                ) = _sellOrders[i].decodeOrder();
                require(
                    userIdOfIter == userId,
                    "Only the user can cancel his orders"
                );
                claimableAmount = claimableAmount.add(sellAmountOfIter);
                emit CancellationSellOrder(
                    userId,
                    buyAmountOfIter,
                    sellAmountOfIter
                );
            }
        }
        tokenIn.safeTransfer(msg.sender, claimableAmount); //[2]
    }

    function precalculateSellAmountSum(uint256 iterationSteps)
        public
        atStageSolutionSubmission
    {
        (, , uint96 auctioneerSellAmount) = initialAuctionOrder.decodeOrder();
        uint256 sumBidAmount = interimSumBidAmount;
        bytes32 iterOrder = interimOrder;

        for (uint256 i = 0; i < iterationSteps; i++) {
            iterOrder = sellOrders.next(iterOrder);
            (, , uint96 sellAmountOfIter) = iterOrder.decodeOrder();
            sumBidAmount = sumBidAmount.add(sellAmountOfIter);
        }

        require(
            iterOrder != IterableOrderedOrderSet.QUEUE_END,
            "reached end of order list"
        );

        // it is checked that not too many iteration steps were taken:
        // require that the sum of SellAmounts times the price of the last order
        // is not more than initially sold amount
        (, uint96 buyAmountOfIter, uint96 sellAmountOfIter) = iterOrder
        .decodeOrder();
        require(
            sumBidAmount.mul(buyAmountOfIter) <
                auctioneerSellAmount.mul(sellAmountOfIter),
            "too many orders summed up"
        );

        interimSumBidAmount = sumBidAmount;
        interimOrder = iterOrder;
    }

    function settleAuctionAtomically(
        uint96[] memory _minBuyAmount,
        uint96[] memory _sellAmount,
        bytes32[] memory _prevSellOrder
    ) public atStageSolutionSubmission {
        require(
            isAtomicClosureAllowed,
            "not allowed to settle auction atomically"
        );
        require(
            _minBuyAmount.length == 1 && _sellAmount.length == 1,
            "Only one order can be placed atomically"
        );
        uint64 userId = getUserId(msg.sender);
        require(
            interimOrder.smallerThan(
                IterableOrderedOrderSet.encodeOrder(
                    userId,
                    _minBuyAmount[0],
                    _sellAmount[0]
                )
            ),
            "precalculateSellAmountSum is already too advanced"
        );
        _placeSellOrders(
            _minBuyAmount,
            _sellAmount,
            _prevSellOrder,
            msg.sender
        );
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
            uint96 minAuctionedBuyAmount,
            uint96 fullAuctionedAmount
        ) = initialAuctionOrder.decodeOrder();

        uint256 currentBidSum = interimSumBidAmount;
        bytes32 currentOrder = interimOrder;
        uint256 buyAmountOfIter;
        uint256 sellAmountOfIter;
        uint96 fillVolumeOfAuctioneerOrder = fullAuctionedAmount;
        // Sum order up, until fullAuctionedAmount is fully bought or queue end is reached
        do {
            bytes32 nextOrder = sellOrders.next(currentOrder);
            if (nextOrder == IterableOrderedOrderSet.QUEUE_END) {
                break;
            }
            currentOrder = nextOrder;
            (, buyAmountOfIter, sellAmountOfIter) = currentOrder.decodeOrder();
            currentBidSum = currentBidSum.add(sellAmountOfIter);
        } while (
            currentBidSum.mul(buyAmountOfIter) <
                fullAuctionedAmount.mul(sellAmountOfIter)
        );

        if (
            currentBidSum > 0 &&
            currentBidSum.mul(buyAmountOfIter) >=
            fullAuctionedAmount.mul(sellAmountOfIter)
        ) {
            // All considered/summed orders are sufficient to close the auction fully
            // at price between current and previous orders.
            uint256 uncoveredBids = currentBidSum.sub(
                fullAuctionedAmount.mul(sellAmountOfIter).div(buyAmountOfIter)
            );

            if (sellAmountOfIter >= uncoveredBids) {
                //[13]
                // Auction fully filled via partial match of currentOrder
                uint256 sellAmountClearingOrder = sellAmountOfIter.sub(
                    uncoveredBids
                );
                volumeClearingPriceOrder = sellAmountClearingOrder.toUint96();
                currentBidSum = currentBidSum.sub(uncoveredBids);
                clearingOrder = currentOrder;
            } else {
                //[14]
                // Auction fully filled via price strictly between currentOrder and the order
                // immediately before. For a proof, see the security-considerations.md
                currentBidSum = currentBidSum.sub(sellAmountOfIter);
                clearingOrder = IterableOrderedOrderSet.encodeOrder(
                    0,
                    fullAuctionedAmount,
                    currentBidSum.toUint96()
                );
            }
        } else {
            // All considered/summed orders are not sufficient to close the auction fully at price of last order //[18]
            // Either a higher price must be used or auction is only partially filled

            if (currentBidSum > minAuctionedBuyAmount) {
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
                    minAuctionedBuyAmount
                );
                fillVolumeOfAuctioneerOrder = currentBidSum
                .mul(fullAuctionedAmount)
                .div(minAuctionedBuyAmount)
                .toUint96();
            }
        }
        clearingPriceOrder = clearingOrder;

        if (minFundingThreshold > currentBidSum) {
            minFundingThresholdNotReached = true;
        }
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

    function claimFromParticipantOrder(bytes32[] memory orders)
        public
        atStageFinished
        returns (uint256 sumTokenOutAmount, uint256 sumTokenInAmount)
    {
        for (uint256 i = 0; i < orders.length; i++) {
            // Note: we don't need to keep any information about the node since
            // no new elements need to be inserted.
            require(
                sellOrders.remove(orders[i]),
                "order is no longer claimable"
            );
        }

        (, uint96 priceNumerator, uint96 priceDenominator) = clearingPriceOrder
        .decodeOrder();
        (uint64 userId, , ) = orders[0].decodeOrder();
        for (uint256 i = 0; i < orders.length; i++) {
            (uint64 userIdOrder, uint96 buyAmount, uint96 sellAmount) = orders[
                i
            ]
            .decodeOrder();
            require(
                userIdOrder == userId,
                "only allowed to claim for same user"
            );
            if (minFundingThresholdNotReached) {
                //[10]
                sumTokenInAmount = sumTokenInAmount.add(sellAmount);
            } else {
                //[23]
                if (orders[i] == clearingPriceOrder) {
                    //[25]
                    sumTokenOutAmount = sumTokenOutAmount.add(
                        volumeClearingPriceOrder.mul(priceNumerator).div(
                            priceDenominator
                        )
                    );
                    sumTokenInAmount = sumTokenInAmount.add(
                        sellAmount.sub(volumeClearingPriceOrder)
                    );
                } else {
                    if (orders[i].smallerThan(clearingPriceOrder)) {
                        //[17]
                        sumTokenOutAmount = sumTokenOutAmount.add(
                            sellAmount.mul(priceNumerator).div(priceDenominator)
                        );
                    } else {
                        //[24]
                        sumTokenInAmount = sumTokenInAmount.add(sellAmount);
                    }
                }
            }
            emit ClaimedFromOrder(userId, buyAmount, sellAmount);
        }
        sendOutTokens(sumTokenOutAmount, sumTokenInAmount, userId); //[3]
    }

    function init(bytes calldata _data) public notInitialized onlyDeployer {
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
        ) = abi.decode(
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

        initAuction(
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

    function sendOutTokens(
        uint256 tokenOutAmount,
        uint256 tokenInAmount,
        uint64 userId
    ) internal {
        address userAddress = registeredUsers.getAddressAt(userId);
        if (tokenOutAmount > 0) {
            tokenOut.safeTransfer(userAddress, tokenOutAmount);
        }
        if (tokenInAmount > 0) {
            tokenIn.safeTransfer(userAddress, tokenInAmount);
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

    function containsOrder(bytes32 order) public view returns (bool) {
        return sellOrders.contains(order);
    }
}
