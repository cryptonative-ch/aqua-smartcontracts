// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ILiquidityLauncher.sol";
import "./interfaces/IAuctionLauncher.sol";
import "./interfaces/IMesaFactory.sol";

interface IAuction {
    function initAuction(
        IERC20 _auctioningToken,
        IERC20 _biddingToken,
        uint256 _orderCancelationPeriodDuration,
        uint256 _duration,
        uint96 _auctionedSellAmount,
        uint96 _minBuyAmount,
        uint256 _minimumBiddingAmountPerOrder,
        uint256 _minFundingThreshold,
        bool _isAtomicClosureAllowed
    ) public;
}

interface IPoolLiquidity {
    function initPoolLiquidity(
        address _router,
        address _tokenA,
        address _tokenB,
        uint256 _amountA,
        uint256 _amountB,
        uint256 _duration,
        uint256 _locktime,
        address _WETH
    ) external;
}

contract MesaSale {
    using SafeMath for uint256;

    IAuction public auction;
    IWETH public WETH;
    ILiquidityLauncher public liquidityLauncher;
    IAuctionLauncer public auctionLauncher;
    IMesaFactory public mesaFactory;
    address public swaprFactory;
    uint256 public feeDenominator;
    uint256 public feeNumerator;

    constructor(
        address _WETH,
        uint256 _auction,
        address _liquidityLauncher,
        address _swaprFactory,
        address _auctionLauncher
    ) public {
        WETH = IWETH(_WETH);
        auction = IAuction(_auction);
        liquidityLauncher = ILiquidityLauncher(_liquidityLauncher);
        auctionLauncher = IAuctionLauncer(_auctionLauncher);
        swaprFactory = _swaprFactory;
        mesaFactory = IAuctionLauncer(_auctionLauncher).factory();
        feeDenominator = IMesaFactory(mesaFactory).feeDenominator();
        feeNumerator = IMesaFactory(mesaFactory).feeNumerator();
    }

    function initTemplate(
        address _tokenOut,
        address _tokenIn,
        address _duration,
        uint256 _tokenOutSupply,
        uint96 _minPrice,
        uint96 _minBuyAmount,
        uint256 _minRaise
    ) public {
        // deposits sellAmount + fees
        _tokenOut.safeTransferFrom(
            msg.sender,
            address(this),
            _totalTokensOut.mul(FEE_DENOMINATOR.add(feeNumerator)).div(
                FEE_DENOMINATOR
            )
        );

        uint256 templateId = 1; // ToDo: Fetch TemplateId for AuctionLauncher
        bytes data; // ToDo: Encoded Data:
        address router; // ToDo
        uint256 duration = 100; // ToDo
        uint256 locktime = 100; // ToDo

        address auctionAddress =
            auctionLauncher.createAuction(
                templateId,
                _tokenOut,
                _tokenOutSupply,
                _data
            );

        // Deploy Liquidity Launcher
        address liquidityLauncher =
            liquidityLauncher.createLiquidityLauncher(0);

        // Init Liquidity Launcher
        IPoolLiquidity(liquidityLauncher).initPoolLiquidity(
            router,
            _tokenOut,
            _tokenIn,
            duration,
            locktime,
            WETH
        );

        // Transfer fees
        auctionLauncher.withdrawRaisedFunds();

        // At this point this template should have both tokenIn & tokenOut
        // ToDo: Get price ratio to calculate amounts

        // Provide Liquidity
        IPoolLiquidity(liquidityLauncher).deposit(_amountA, _amountB);
        IPoolLiquidity(liquidityLauncher).provideLiquidity();
    }
}
