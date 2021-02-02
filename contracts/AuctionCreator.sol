// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./EasyAuction.sol";

contract IdoCreator {
    using SafeERC20 for IERC20;

    event NewAuction(address indexed auction);

    uint256 public feeNumerator;
    address[] public allAuctions;
    address public feeTo;
    address public feeManager;

    constructor(
        address _feeManager,
        address _feeTo,
        uint256 _feeNumerator
    ) public {
        feeManager = _feeManager;
        feeTo = _feeTo;
        feeNumerator = _feeNumerator;
    }

    function createAuction(
        IERC20 _auctioningToken,
        IERC20 _biddingToken,
        uint256 _orderCancelationPeriodDuration,
        uint256 _duration,
        uint96 _auctionedSellAmount,
        uint96 _minBuyAmount,
        uint256 _minimumBiddingAmountPerOrder,
        uint256 _minFundingThreshold,
        bool _isAtomicClosureAllowed
    ) external returns (address) {
        EasyAuction newAuction =
            new EasyAuction(
                _auctioningToken,
                _biddingToken,
                _orderCancelationPeriodDuration,
                _duration,
                _auctionedSellAmount,
                _minBuyAmount,
                _minimumBiddingAmountPerOrder,
                _minFundingThreshold,
                _isAtomicClosureAllowed
            );
        allAuctions.push(address(newAuction));
        emit NewAuction(address(newAuction));
        return address(newAuction);
    }

    function setFeeTo(address _feeTo) external {
        require(msg.sender == feeManager, "EasyAuctionFactory: FORBIDDEN");
        feeTo = _feeTo;
    }

    function setFeeNumerator(uint256 _feeNumerator) external {
        require(msg.sender == feeManager, "EasyAuctionFactory: FORBIDDEN");
        feeNumerator = _feeNumerator;
    }

    function setFeeManager(address _feeManager) external {
        require(msg.sender == feeManager, "EasyAuctionFactory: FORBIDDEN");
        feeManager = _feeManager;
    }

    function allAuctionsLength() external view returns (uint256) {
        return allAuctions.length;
    }
}
