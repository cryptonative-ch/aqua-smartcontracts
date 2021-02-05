// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "dxswap-core/contracts/interfaces/IDXswapFactory.sol";
import "dxswap-periphery/contracts/interfaces/IDXswapRouter.sol";
import "../libraries/TransferHelper.sol";
import "../interfaces/IWETH.sol";

contract PoolLiquidity {
    bool private initialised;
    address public WETH;
    address public router;
    address public factory;
    address public tokenA;
    address public tokenB;
    address public pair;
    uint256 public amountA;
    uint256 public amountB;
    uint256 public locktime;
    uint256 public expirationDate;
    uint256 public unlockDate;
    uint256 public liquidity;

    mapping(address => mapping(address => uint256)) public tokenBalances;
    mapping(address => uint256) public totals;

    event InitPoolLiquidity(
        address indexed tokenA,
        address indexed tokenB,
        address factory
    );
    event LiquidityAdded(uint256 liquidity);

    constructor() public {}

    function initPoolLiquidity(
        address _router,
        address _tokenA,
        address _tokenB,
        uint256 _amountA,
        uint256 _amountB,
        uint256 _duration,
        uint256 _locktime,
        address _WETH
    ) external {
        require(!initialised, "PoolLiquidity: ALREADY_INITIALIZED");
        router = _router;
        tokenA = _tokenA;
        tokenB = _tokenB;
        amountA = _amountA;
        amountB = _amountB;
        WETH = _WETH;
        initialised = true;
        factory = IDXswapRouter(router).factory();
        pair = IDXswapFactory(factory).getPair(_tokenA, _tokenB);
        if (pair == address(0)) {
            IDXswapFactory(factory).createPair(_tokenA, _tokenB);
        }
        expirationDate = block.timestamp + _duration;
        locktime = _locktime;
        unlockDate = block.timestamp + _locktime;
        emit InitPoolLiquidity(_tokenA, _tokenB, factory);
    }

    function deposit(uint256 _amountA, uint256 _amountB) external {
        require(block.timestamp < expirationDate, "PoolLiquidity: EXPIRED");
        require(liquidity == 0, "PoolLiquidity: LIQUIDITY_ALREADY_PROVIDED");
        TransferHelper.safeTransfer(tokenA, address(this), _amountA);
        TransferHelper.safeTransfer(tokenB, address(this), _amountB);
        tokenBalances[tokenA][msg.sender] += _amountA;
        tokenBalances[tokenB][msg.sender] += _amountB;
        totals[tokenA] += _amountA;
        totals[tokenB] += _amountB;
    }

    function provideLiquidity() external {
        require(block.timestamp < expirationDate, "PoolLiquidity: EXPIRED");
        require(liquidity == 0, "PoolLiquidity: LIQUIDITY_ALREADY_PROVIDED");

        // Set approvals for router to exact token amounts
        TransferHelper.safeApprove(tokenA, router, amountA);
        TransferHelper.safeApprove(tokenB, router, amountB);

        uint256 depositedLiquidity;
        (, , depositedLiquidity) = IDXswapRouter(router).addLiquidity(
            tokenA,
            tokenB,
            amountA,
            amountB,
            amountA,
            amountB,
            address(this),
            block.timestamp
        );

        // Reset approvals to zero
        TransferHelper.safeApprove(tokenA, router, 0);
        TransferHelper.safeApprove(tokenB, router, 0);
        liquidity = depositedLiquidity;
        emit LiquidityAdded(liquidity);
    }

    function claim() external {
        require(liquidity > 0, "PoolLiquidity: NOTHING_TO_CLAIM");
        require(block.timestamp > unlockDate, "PoolLiquidity: NOT_UNLOCKED");
        uint256 amount = 0;
        amount +=
            (tokenBalances[tokenA][msg.sender] * liquidity) /
            totals[tokenA] /
            2;
        tokenBalances[tokenA][msg.sender] = 0;
        amount +=
            (tokenBalances[tokenB][msg.sender] * liquidity) /
            totals[tokenB] /
            2;
        tokenBalances[tokenB][msg.sender] = 0;
        TransferHelper.safeTransfer(pair, msg.sender, amount);
    }

    function widthrawExpiredTokens() external {
        require(liquidity == 0, "PoolLiquidity: NOTHING_TO_WITHDRAW");
        require(block.timestamp > expirationDate, "PoolLiquidity: NOT_EXPIRED");
        uint256 amountA = tokenBalances[tokenA][msg.sender];
        uint256 amountB = tokenBalances[tokenB][msg.sender];
        tokenBalances[tokenA][msg.sender] = 0;
        tokenBalances[tokenA][msg.sender] = 0;
        totals[tokenA] -= amountA;
        totals[tokenA] -= amountB;
        TransferHelper.safeTransfer(tokenA, msg.sender, amountA);
        TransferHelper.safeTransfer(tokenA, msg.sender, amountB);
    }
}
