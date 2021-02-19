// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interfaces/IAuctionLauncher.sol";
import "../libraries/TransferHelper.sol";
import "../interfaces/IMesaFactory.sol";
import "../interfaces/IWETH.sol";

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
    ) external;
}

contract MesaSale {
    using SafeMath for uint256;

    IAuction public auction;
    IWETH public WETH;
    IAuctionLauncher public auctionLauncher;
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
        auctionLauncher = IAuctionLauncher(_auctionLauncher);
        mesaFactory = IMesaFactory(IAuctionLauncher(_auctionLauncher).factory());
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
    ) public returns (address newAuction){
        uint256 orderCancelationPeriodDuration = 100;
        uint256 minimumBiddingAmountPerOrder = 100;
        bool isAtomicClosureAllowed = false;
        bytes memory encodedInitData = abi.encode(
                IERC20(_tokenOut),
                IERC20(_tokenIn),
                orderCancelationPeriodDuration,
                _duration,
                _tokenOutSupply,
                _minBuyAmount,
                minimumBiddingAmountPerOrder,
                _minRaise,
                isAtomicClosureAllowed
        );

        uint256 depositAmount =
            _tokenOutSupply.mul(feeDenominator.add(feeNumerator)).div(
                feeDenominator
            );

        // deposits sellAmount + fees
        TransferHelper.safeTransferFrom(_tokenOut, msg.sender, address(this), depositAmount);

        // approve deposited tokens on auctionLauncher
        TransferHelper.safeApprove(_tokenOut, address(auctionLauncher), depositAmount);

        newAuction =
            auctionLauncher.createAuction(
                auctionTemplateId,
                _tokenOut,
                _tokenOutSupply,
                encodedInitData
            );
    }
}
