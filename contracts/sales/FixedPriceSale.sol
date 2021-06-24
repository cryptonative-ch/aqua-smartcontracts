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
    event NewCommitment(address indexed user, uint256 indexed amount);
    event NewTokenWithdraw(address indexed user, uint256 indexed amount);
    event NewTokenRelease(address indexed user, uint256 indexed amount);
    event SaleClosed();

    string public constant TEMPLATE_NAME = "FixedPriceSale";
    address public owner;
    address private deployer;
    IERC20 public tokenIn;
    IERC20 public tokenOut;
    uint256 public tokenPrice;
    uint256 public tokensForSale;
    uint256 public tokensCommitted;
    uint256 public startDate;
    uint256 public endDate;
    uint256 public allocationMin;
    uint256 public allocationMax;
    uint256 public minimumRaise;
    bool public isClosed;
    bool public saleSucceeded;
    bool private initialized;

    mapping(address => uint256) public commitment;

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
    /// @param _minimumRaise minimum amount an project is expected to raise, amount of tokenIn
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
    function commitTokens(uint256 amount) public {
        require(!isClosed, "FixedPriceSale: sale closed");
        require(amount >= allocationMin, "FixedPriceSale: amount to low");
        require(
            allocationMax == 0 ||
                commitment[msg.sender].add(amount) <= allocationMax,
            "FixedPriceSale: allocationMax reached"
        );
        require(block.timestamp < endDate, "FixedPriceSale: deadline passed");
        require(
            _getTokenAmount(tokensCommitted.add(amount)) <= tokensForSale,
            "FixedPriceSale: sale sold out"
        );
        tokenIn.safeTransferFrom(msg.sender, address(this), amount);
        commitment[msg.sender] = commitment[msg.sender].add(amount);

        tokensCommitted = tokensCommitted.add(amount);
        emit NewCommitment(msg.sender, amount);
    }

    /// @dev close sale if either minRaise is reached or endDate passed
    function closeSale() public {
        require(!isClosed, "FixedPriceSale: already closed");
        require(
            block.timestamp > endDate ||
                _getTokenAmount(tokensCommitted) == tokensForSale,
            "FixedPriceSale: sale cannot be closed"
        );

        isClosed = true;
        if (tokensCommitted >= minimumRaise) {
            saleSucceeded = true;
            TransferHelper.safeTransfer(
                address(tokenIn),
                owner,
                tokensCommitted
            );
            uint256 soldTokens = _getTokenAmount(tokensCommitted);
            uint256 unsoldTokens = uint256(tokensForSale).sub(soldTokens);
            if (unsoldTokens > 0) {
                TransferHelper.safeTransfer(
                    address(tokenOut),
                    owner,
                    unsoldTokens
                );
            }
        } else {
            TransferHelper.safeTransfer(
                address(tokenOut),
                owner,
                tokensForSale.sub(_getTokenAmount(tokensCommitted))
            );
        }

        emit SaleClosed();
    }

    /// @dev withdraws purchased tokens if sale successfull, if not releases committed tokens
    function withdrawTokens(address user) public {
        if (minimumRaiseReached()) {
            require(isClosed, "FixedPriceSale: not closed yet");
            uint256 withdrawAmount = _getTokenAmount(commitment[user]);
            commitment[user] = 0;
            TransferHelper.safeTransfer(
                address(tokenOut),
                user,
                withdrawAmount
            );
            emit NewTokenWithdraw(user, withdrawAmount);
        } else {
            require(
                block.timestamp > endDate,
                "FixedPriceSale: endDate not reached"
            );
            uint256 releaseAmount = commitment[user];
            commitment[user] = 0;
            TransferHelper.safeTransfer(address(tokenIn), user, releaseAmount);
            emit NewTokenRelease(user, releaseAmount);
        }
    }

    function _getTokenAmount(uint256 _amount) internal view returns (uint256) {
        return _amount.mul(uint256(tokenPrice)).div(1e18);
    }

    function minimumRaiseReached() public view returns (bool) {
        return tokensCommitted >= minimumRaise;
    }

    function saleEnded() public view returns (bool) {
        return
            block.timestamp > endDate ||
            _getTokenAmount(tokensCommitted) == tokensForSale;
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
        if (saleSucceeded) {
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
        return tokensForSale.sub(_getTokenAmount(tokensCommitted));
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
