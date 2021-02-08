// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IAuctionCreator.sol";
import "../libraries/TransferHelper.sol";

contract FixedPriceAuction is Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint64;
    using SafeMath for uint96;
    using SafeMath for uint256;

    event AuctionInitalized(
        IERC20 tokenIn,
        IERC20 tokenOut,
        uint256 tokenPrice,
        uint256 tokensForSale,
        uint256 startDate,
        uint256 endDate,
        uint256 purchaseMinimum,
        uint256 purchaseMaximum,
        uint256 minimumRaise
    );

    event NewPurchase(address buyer, uint256 buyAmount);

    event NewTokenClaim(address buyer, uint256 amount);

    enum States {Initialized, Open, Closed}

    uint256 public immutable FEE_DENOMINATOR = 1000;
    address public idoManager;
    IERC20 public tokenIn;
    IERC20 public tokenOut;
    uint256 public tokenPrice;
    uint256 public tokensForSale;
    uint256 public tokensSold;
    uint256 public startDate;
    uint256 public endDate;
    uint256 public purchaseMinimum;
    uint256 public purchaseMaximum;
    uint256 public minimumRaise;
    uint256 public fee;
    bool public hasWhitelisting;
    mapping(address => bool) public isWhitelisted;
    address public fundsReceiver;
    address public idoCreator;
    States public auctionState;

    mapping(address => uint256) public tokensPurchased;

    modifier onlyIdoManager {
        require(msg.sender == idoManager, "FixedPriceAuction: FORBIDDEN");
        _;
    }

    function initAuction(
        IERC20 _tokenIn,
        IERC20 _tokenOut,
        uint256 _tokenPrice,
        uint256 _tokensForSale,
        uint256 _startDate,
        uint256 _endDate,
        uint256 _purchaseMinimum,
        uint256 _purchaseMaximum,
        uint256 _minimumRaise,
        address _fundsReceiver,
        address _idoManager
    ) public onlyIdoManager() {
        require(_tokenIn != _tokenOut, "FixedPriceAuction: invalid tokens");
        require(_tokenPrice > 0, "FixedPriceAuction: invalid tokenPrice");
        require(_tokensForSale > 0, "FixedPriceAuction: invalid tokensForSale");
        require(
            _startDate > block.timestamp || _startDate == 0,
            "FixedPriceAuction: invalid startDate"
        );
        require(
            _endDate > _startDate || _endDate == 0,
            "FixedPriceAuction: invalid endDate"
        );
        tokenIn = _tokenIn;
        tokenOut = _tokenOut;
        tokenPrice = _tokenPrice;
        tokensForSale = _tokensForSale;
        startDate = _startDate;
        endDate = _endDate;
        purchaseMinimum = _purchaseMinimum;
        purchaseMaximum = _purchaseMaximum;
        minimumRaise = _minimumRaise;
        fundsReceiver = _fundsReceiver;
        idoManager = _idoManager;

        emit AuctionInitalized(
            _tokenIn,
            _tokenOut,
            _tokenPrice,
            _tokensForSale,
            _startDate,
            _endDate,
            _purchaseMinimum,
            _purchaseMaximum,
            _minimumRaise
        );
    }

    function initAuction(bytes calldata _data) public {
        (
            IERC20 _tokenIn,
            IERC20 _tokenOut,
            uint256 _tokenPrice,
            uint256 _tokensForSale,
            uint256 _startDate,
            uint256 _endDate,
            uint256 _purchaseMinimum,
            uint256 _purchaseMaximum,
            uint256 _minimumRaise,
            address _fundsReceiver,
            address _idoManager
        ) =
            abi.decode(
                _data,
                (
                    IERC20,
                    IERC20,
                    uint256,
                    uint256,
                    uint256,
                    uint256,
                    uint256,
                    uint256,
                    uint256,
                    address,
                    address
                )
            );

        initAuction(
            _tokenIn,
            _tokenOut,
            _tokenPrice,
            _tokensForSale,
            _startDate,
            _endDate,
            _purchaseMinimum,
            _purchaseMaximum,
            _minimumRaise,
            _fundsReceiver,
            _idoManager
        );
    }

    function depositAuctionTokens() public onlyIdoManager() {
        require(
            auctionState == States.Initialized,
            "FixedPriceAuction: Invalid State"
        );

        // deposit sellAmount + fees
        auctionState = States.Open;
        tokenOut.safeTransferFrom(
            msg.sender,
            address(this),
            tokensForSale.mul(FEE_DENOMINATOR.add(fee)).div(FEE_DENOMINATOR)
        );
    }

    function buyTokens(uint256 amount) public {
        require(
            !hasWhitelisting || isWhitelisted[msg.sender],
            "EasyAuction: forbidden"
        );
        require(auctionState == States.Open, "EasyAuction: auction not open");
        require(amount >= purchaseMinimum, "EasyAuction: amount to low");
        require(
            purchaseMaximum == 0 ||
                tokensPurchased[msg.sender].add(amount) < purchaseMaximum,
            "EasyAuction: purchaseMaximum reached"
        );
        require(block.timestamp < endDate, "EasyAuction: auction closed");
        tokenIn.safeTransferFrom(msg.sender, address(this), amount);
        tokensPurchased[msg.sender] = amount;
        tokensSold = tokensSold.add(amount);
        emit NewPurchase(msg.sender, amount);
    }

    function closeAuction() public {
        require(auctionState == States.Open, "EasyAuction: invalid status");
        require(block.timestamp > endDate, "EasyAuction: endDate not passed");
        require(
            tokensSold >= minimumRaise,
            "EasyAuction: minumumRaise not reached"
        );
        auctionState = States.Closed;
    }

    function releaseTokens() public {
        require(minimumRaise > 0, "EasyAuction: no minumumRaise");
        require(block.timestamp > endDate, "EasyAuction: endDate not passed");
        require(
            tokensSold < minimumRaise,
            "EasyAuction: minumumRaise not reached"
        );

        uint256 tokensAmount = tokensPurchased[msg.sender];
        tokensPurchased[msg.sender] = 0;
        auctionState = States.Closed;
        tokenIn.safeTransferFrom(msg.sender, address(this), tokensAmount);
    }

    function claimTokens() public {
        require(
            auctionState == States.Closed,
            "EasyAuction: auction not closed"
        );
        require(
            tokensPurchased[msg.sender] > 0,
            "EasyAuction: no tokens to claim"
        );
        uint256 purchasedTokens = tokensPurchased[msg.sender];
        tokensPurchased[msg.sender] = 0;
        tokenOut.safeTransfer(msg.sender, purchasedTokens);
        emit NewTokenClaim(msg.sender, purchasedTokens);
    }

    function claimFees() external {
        require(
            auctionState == States.Closed,
            "EasyAuction: auction not closed"
        );

        tokenOut.safeTransfer(
            IAuctionCreator(idoCreator).feeTo(),
            tokensForSale
                .mul(FEE_DENOMINATOR.add(fee))
                .div(FEE_DENOMINATOR)
                .sub(tokensForSale)
        );
    }

    function withdrawFunds() external {
        require(
            auctionState == States.Closed,
            "EasyAuction: auction not closed"
        );

        TransferHelper.safeTransfer(
            address(tokenIn),
            fundsReceiver,
            IERC20(tokenIn).balanceOf(address(this))
        );
    }

    function withdrawUnsoldFunds() external {
        require(
            auctionState == States.Closed,
            "EasyAuction: auction not closed"
        );

        TransferHelper.safeTransfer(
            address(tokenOut),
            fundsReceiver,
            IERC20(tokenOut).balanceOf(address(this))
        );
    }

    function ERC20Withdraw(address token, uint256 amount)
        external
        onlyIdoManager()
    {
        require(
            auctionState == States.Closed,
            "EasyAuction: auction not closed"
        );
        TransferHelper.safeTransfer(token, fundsReceiver, amount);
    }

    function ETHWithdraw(uint256 amount) external onlyIdoManager() {
        require(
            auctionState == States.Closed,
            "EasyAuction: auction not closed"
        );
        TransferHelper.safeTransferETH(fundsReceiver, amount);
    }

    function tokensRemaining() public view returns (uint256) {
        return tokensForSale.sub(tokensSold);
    }

    function secondsRemainingInAuction() public view returns (uint256) {
        if (endDate < block.timestamp) {
            return 0;
        }
        return endDate.sub(block.timestamp);
    }
}
