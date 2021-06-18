// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../shared/libraries/TransferHelper.sol";

contract FixedPriceSale {
    using SafeERC20 for IERC20;
    using SafeMath for uint64;
    using SafeMath for uint96;
    using SafeMath for uint256;

    modifier notInitialized() {
        require(!initialized, "already initialized");
        _;
    }

    event SaleInitialized(
        IERC20 tokenIn,
        IERC20 tokenOut,
        uint256 tokenPrice,
        uint256 tokensForSale,
        uint256 startDate,
        uint256 endDate,
        uint256 allocationMin,
        uint256 allocationMax,
        uint256 minimumRaise,
        address owner
    );

    event NewPurchase(address indexed buyer, uint256 indexed amount);

    event NewTokenClaim(address indexed buyer, uint256 indexed amount);

    event DistributeAllTokensLeft(uint256 indexed amount);

    event NewTokenRelease(address indexed buyer, uint256 indexed amount);

    event SaleClosed();

    string public constant TEMPLATE_NAME = "FixedPriceSale";
    address public owner;
    address private deployer;
    IERC20 public tokenIn;
    IERC20 public tokenOut;
    uint256 public tokenPrice;
    uint256 public tokensForSale;
    uint256 public tokensSold;
    uint256 public startDate;
    uint256 public endDate;
    uint256 public allocationMin;
    uint256 public allocationMax;
    uint256 public minimumRaise;
    bool public isClosed;
    bool initialized;

    mapping(address => uint256) public tokensPurchased;

    address[] public orderOwners;

    modifier onlyOwner {
        require(msg.sender == owner, "FixedPriceSale: FORBIDDEN");
        _;
    }

    modifier onlyDeployer {
        require(msg.sender == deployer, "FixedPriceSale: FORBIDDEN");
        _;
    }

    constructor() public {
        deployer = msg.sender;
    }

    /// @dev internal setup function to initialize the template, called by init()
    /// @param _tokenIn token to make the bid in
    /// @param _tokenOut token to buy
    /// @param _tokenPrice fixed token price
    /// @param _tokensForSale amount of tokens to be sold
    /// @param _startDate start date
    /// @param _endDate end date
    /// @param _allocationMin minimum tokenOut to buy
    /// @param _allocationMax maximum tokenOut to buy
    /// @param _minimumRaise minimum amount an project is expected to raise
    /// @param _owner owner of the sale
    function initSale(
        IERC20 _tokenIn,
        IERC20 _tokenOut,
        uint256 _tokenPrice,
        uint256 _tokensForSale,
        uint256 _startDate,
        uint256 _endDate,
        uint256 _allocationMin,
        uint256 _allocationMax,
        uint256 _minimumRaise,
        address _owner
    ) internal {
        require(_tokenIn != _tokenOut, "FixedPriceSale: invalid tokens");
        require(_tokenPrice > 0, "FixedPriceSale: invalid tokenPrice");
        require(_tokensForSale > 0, "FixedPriceSale: invalid tokensForSale");
        require(
            _startDate > block.timestamp || _startDate == 0,
            "FixedPriceSale: invalid startDate"
        );
        require(
            _endDate > _startDate || _endDate == 0,
            "FixedPriceSale: invalid endDate"
        );
        initialized = true;
        tokenIn = _tokenIn;
        tokenOut = _tokenOut;
        tokenPrice = _tokenPrice;
        tokensForSale = _tokensForSale;
        startDate = _startDate;
        endDate = _endDate;
        allocationMin = _allocationMin;
        allocationMax = _allocationMax;
        minimumRaise = _minimumRaise;
        owner = _owner;
        isClosed = false;
        tokenOut.safeTransferFrom(msg.sender, address(this), tokensForSale);

        emit SaleInitialized(
            _tokenIn,
            _tokenOut,
            _tokenPrice,
            _tokensForSale,
            _startDate,
            _endDate,
            _allocationMin,
            _allocationMax,
            _minimumRaise,
            _owner
        );
    }

    /// @dev reserve tokens for a fixed price
    /// @param amount of tokenIn to buy at a fixed price
    function buyTokens(uint256 amount) public {
        require(!isClosed, "FixedPriceSale: sale closed");
        require(amount >= allocationMin, "FixedPriceSale: amount to low");
        require(
            allocationMax == 0 ||
                tokensPurchased[msg.sender].add(amount) <= allocationMax,
            "FixedPriceSale: allocationMax reached"
        );
        require(block.timestamp < endDate, "FixedPriceSale: deadline passed");
        require(
            tokensSold.add(amount) <= tokensForSale,
            "FixedPriceSale: sale sold out"
        );
        tokenIn.safeTransferFrom(msg.sender, address(this), amount);

        if (tokensPurchased[msg.sender] == 0) {
            orderOwners.push(msg.sender);
        }

        tokensPurchased[msg.sender] = tokensPurchased[msg.sender].add(amount);

        tokensSold = tokensSold.add(amount);
        emit NewPurchase(msg.sender, amount);
    }

    /// @dev close sale if minRaise is reached
    function closeSale() public {
        require(!isClosed, "FixedPriceSale: already closed");
        require(
            block.timestamp > endDate,
            "FixedPriceSale: endDate not passed"
        );
        require(
            tokensSold >= minimumRaise,
            "FixedPriceSale: minumumRaise not reached"
        );
        isClosed = true;
        emit SaleClosed();
    }

    /// @dev realease tokenIn back to investors if minimumRaise not reached
    /// can also be used from external script to automatically release tokens for investors
    function releaseTokens(address account) public {
        require(minimumRaise > 0, "FixedPriceSale: no minumumRaise");
        require(
            block.timestamp > endDate,
            "FixedPriceSale: endDate not passed"
        );
        require(
            tokensPurchased[account] > 0,
            "FixedPriceSale: no tokens purchased by this investor"
        );
        require(
            tokensSold < minimumRaise,
            "FixedPriceSale: minumumRaise reached"
        );

        uint256 tokensAmount = tokensPurchased[account];
        tokensPurchased[account] = 0;
        TransferHelper.safeTransfer(address(tokenIn), account, tokensAmount);
        emit NewTokenRelease(account, tokensAmount);
    }

    /// @dev let investors claim their purchased tokens
    /// can also be used from external script to automatically claim tokens for investors
    function claimTokens(address account) public {
        require(isClosed, "FixedPriceSale: sale not closed");
        require(
            tokensPurchased[account] > 0,
            "FixedPriceSale: no tokens to claim"
        );
        uint256 purchasedTokens = tokensPurchased[account].mul(tokenPrice);
        tokensPurchased[account] = 0;
        TransferHelper.safeTransfer(
            address(tokenOut),
            account,
            purchasedTokens
        );
        emit NewTokenClaim(account, purchasedTokens);
    }

    /// @dev count how many orders
    function ordersCount() public view returns (uint256) {
        return orderOwners.length;
    }

    /// @dev withdraw collected funds
    function _withdrawFunds() internal {
        require(isClosed, "FixedPriceSale: sale not closed");

        TransferHelper.safeTransfer(
            address(tokenIn),
            owner,
            IERC20(tokenIn).balanceOf(address(this))
        );
    }

    /// @dev withdraw collected funds
    // version with calldata see below
    function withdrawFunds() external onlyOwner() {
        _withdrawFunds();
    }

    /// @dev withdraw tokenOut which have no been sold
    function withdrawUnsoldFunds() external {
        require(isClosed, "FixedPriceSale: sale not closed");

        TransferHelper.safeTransfer(
            address(tokenOut),
            owner,
            tokensForSale.sub(tokensSold)
        );
    }

    /// @dev init function expexted to be called by SaleLauncher to init the sale
    /// @param _data encoded init params
    function init(bytes calldata _data) public notInitialized onlyDeployer {
        (
            IERC20 _tokenIn,
            IERC20 _tokenOut,
            uint256 _tokenPrice,
            uint256 _tokensForSale,
            uint256 _startDate,
            uint256 _endDate,
            uint256 _allocationMin,
            uint256 _allocationMax,
            uint256 _minimumRaise,
            address _owner
        ) = abi.decode(
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
                address
            )
        );

        initSale(
            _tokenIn,
            _tokenOut,
            _tokenPrice,
            _tokensForSale,
            _startDate,
            _endDate,
            _allocationMin,
            _allocationMax,
            _minimumRaise,
            _owner
        );
    }

    /// @dev withdraw any ERC20 token by owner
    /// @param token ERC20 token address
    /// @param amount Amount to withdraw
    function ERC20Withdraw(address token, uint256 amount) external onlyOwner() {
        require(isClosed, "FixedPriceSale: sale not closed");
        require(
            block.timestamp > endDate,
            "FixedPriceSale: deadline not reached"
        );
        if (isClosed) {
            require(
                token != address(tokenOut),
                "FixedPriceSale: cannot withdraw tokenOut"
            );
        }
        TransferHelper.safeTransfer(token, owner, amount);
    }

    /// @dev withdraw ETH token by owner
    /// @param amount ETH amount to withdraw
    function ETHWithdraw(uint256 amount) external onlyOwner() {
        require(isClosed, "FixedPriceSale: sale not closed");
        require(
            block.timestamp > endDate,
            "FixedPriceSale: deadline not reached"
        );
        TransferHelper.safeTransferETH(owner, amount);
    }

    /// @dev to get remaining token at any point of the sale
    function tokensRemaining() public view returns (uint256) {
        return tokensForSale.sub(tokensSold);
    }

    /// @dev to get the remaining time of the sale in seconds
    function secondsRemainingInSale() public view returns (uint256) {
        if (endDate < block.timestamp) {
            return 0;
        }
        return endDate.sub(block.timestamp);
    }

    receive() external payable {}
}
