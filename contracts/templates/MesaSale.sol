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

contract MesaSale {
    using SafeMath for uint256;

    IAuction public auction;
    IWETH public WETH;
    IAuctionLauncer public auctionLauncher;
    IMesaFactory public mesaFactory;
    uint256 public feeDenominator;
    uint256 public feeNumerator;
    uint256 public auctionTemplateId;

    constructor(
        address _WETH,
        uint256 _auction,
        address _auctionLauncher,
        uint256 _auctionTemplateId
    ) public {
        WETH = IWETH(_WETH);
        auction = IAuction(_auction);
        auctionLauncher = IAuctionLauncer(_auctionLauncher);
        mesaFactory = IAuctionLauncer(_auctionLauncher).factory();
        feeDenominator = IMesaFactory(mesaFactory).feeDenominator();
        feeNumerator = IMesaFactory(mesaFactory).feeNumerator();
        auctionTemplateId = _auctionTemplateId;
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

        bytes data; // ToDo: encode easyAuction params

        uint256 depositAmount =
            _totalTokensOut.mul(FEE_DENOMINATOR.add(feeNumerator)).div(
                FEE_DENOMINATOR
            );

        // deposits sellAmount + fees
        _tokenOut.safeTransferFrom(msg.sender, address(this), depositAmount);

        // approve deposited tokens on auctionLauncher
        safeApprove(_tokenOut, address(auctionLauncher), depositAmount);

        address auctionAddress =
            auctionLauncher.createAuction(
                auctionTemplateId,
                _tokenOut,
                _tokenOutSupply,
                _data
            );
    }
}
