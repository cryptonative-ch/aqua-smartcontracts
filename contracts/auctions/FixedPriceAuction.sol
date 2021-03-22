// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interfaces/IAuctionCreator.sol";
import "../libraries/TransferHelper.sol";

contract FixedPriceAuction {
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
        uint256 allocationMin,
        uint256 allocationMax,
        uint256 minimumRaise
    );

    event NewPurchase(address indexed buyer, uint256 indexed amount);

    event NewTokenClaim(address indexed buyer, uint256 indexed amount);

    event NewTokenRelease(address indexed buyer, uint256 indexed amount);

    event AuctionClosed();

    string public constant templateName = "FixedPriceAuction";
    address public owner;
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

    mapping(address => uint256) public tokensPurchased;

    modifier onlyOwner {
        require(msg.sender == owner, "FixedPriceAuction: FORBIDDEN");
        _;
    }

    constructor() public {}

    function initAuction(
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
        allocationMin = _allocationMin;
        allocationMax = _allocationMax;
        minimumRaise = _minimumRaise;
        owner = _owner;
        isClosed = false;
        tokenOut.safeTransferFrom(msg.sender, address(this), tokensForSale);

        emit AuctionInitalized(
            _tokenIn,
            _tokenOut,
            _tokenPrice,
            _tokensForSale,
            _startDate,
            _endDate,
            _allocationMin,
            _allocationMax,
            _minimumRaise
        );
    }

    function init(bytes calldata _data) public {
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
            _allocationMin,
            _allocationMax,
            _minimumRaise,
            _owner
        );
    }

    function buyTokens(uint256 amount) public {
        require(!isClosed, "FixedPriceAuction: auction closed");
        require(amount >= allocationMin, "FixedPriceAuction: amount to low");
        require(
            allocationMax == 0 ||
                tokensPurchased[msg.sender].add(amount) <= allocationMax,
            "FixedPriceAuction: allocationMax reached"
        );
        require(
            block.timestamp < endDate,
            "FixedPriceAuction: auction deadline passed"
        );
        tokenIn.safeTransferFrom(msg.sender, address(this), amount);
        tokensPurchased[msg.sender] = amount;
        tokensSold = tokensSold.add(amount);
        emit NewPurchase(msg.sender, amount);
    }

    function closeAuction() public {
        require(!isClosed, "FixedPriceAuction: already closed");
        require(
            block.timestamp > endDate,
            "FixedPriceAuction: endDate not passed"
        );
        require(
            tokensSold >= minimumRaise,
            "FixedPriceAuction: minumumRaise not reached"
        );
        isClosed = true;
        emit AuctionClosed();
    }

    // realease tokenIn back to investors if minRaise not reached
    function releaseTokens() public {
        require(minimumRaise > 0, "FixedPriceAuction: no minumumRaise");
        require(
            block.timestamp > endDate,
            "FixedPriceAuction: endDate not passed"
        );
        require(
            tokensPurchased[msg.sender] > 0,
            "FixedPriceAuction: no tokens to release"
        );
        require(
            tokensSold < minimumRaise,
            "FixedPriceAuction: minumumRaise reached"
        );

        uint256 tokensAmount = tokensPurchased[msg.sender];
        tokensPurchased[msg.sender] = 0;
        isClosed = true;
        TransferHelper.safeTransfer(address(tokenIn), msg.sender, tokensAmount);
        emit NewTokenRelease(msg.sender, tokensAmount);
    }

    // let investors claim their auctioned tokens
    function claimTokens() public {
        require(isClosed, "FixedPriceAuction: auction not closed");
        require(
            tokensPurchased[msg.sender] > 0,
            "FixedPriceAuction: no tokens to claim"
        );
        uint256 purchasedTokens = tokensPurchased[msg.sender];
        tokensPurchased[msg.sender] = 0;
        TransferHelper.safeTransfer(
            address(tokenOut),
            msg.sender,
            purchasedTokens
        );
        emit NewTokenClaim(msg.sender, purchasedTokens);
    }

    function _withdrawFunds() internal {
        require(isClosed, "FixedPriceAuction: auction not closed");

        TransferHelper.safeTransfer(
            address(tokenIn),
            owner,
            IERC20(tokenIn).balanceOf(address(this))
        );
    }

    function withdrawFunds(bytes calldata _data) external onlyOwner() {
        _withdrawFunds();
    }

    function withdrawUnsoldFunds() external {
        require(isClosed, "FixedPriceAuction: auction not closed");

        TransferHelper.safeTransfer(
            address(tokenOut),
            owner,
            tokensForSale.sub(tokensSold)
        );
    }

    function ERC20Withdraw(address token, uint256 amount) external onlyOwner() {
        require(
            block.timestamp > endDate,
            "FixedPriceAuction: auction not ended"
        );
        TransferHelper.safeTransfer(token, owner, amount);
    }

    function ETHWithdraw(uint256 amount) external onlyOwner() {
        require(
            block.timestamp > endDate,
            "FixedPriceAuction: auction not ended"
        );
        TransferHelper.safeTransferETH(owner, amount);
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

    receive() external payable {}
}
