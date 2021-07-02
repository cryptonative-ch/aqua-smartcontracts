// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../shared/libraries/TransferHelper.sol";
import "../shared/interfaces/IParticipantList.sol";

contract FixedPriceSale {
    using SafeERC20 for IERC20;
    using SafeMath for uint64;
    using SafeMath for uint96;
    using SafeMath for uint256;

    modifier notInitialized() {
        require(!saleStatus.initialized, "already initialized");
        _;
    }

    event SaleInitialized(
        IERC20 tokenIn,
        IERC20 tokenOut,
        uint256 tokenPrice,
        uint256 tokensForSale,
        uint256 startDate,
        uint256 endDate,
        uint256 minCommitment,
        uint256 maxCommitment,
        uint256 minRaise,
        address owner,
        address participantList
    );
    event NewCommitment(address indexed user, uint256 indexed amount);
    event NewTokenWithdraw(address indexed user, uint256 indexed amount);
    event NewTokenRelease(address indexed user, uint256 indexed amount);
    event SaleClosed();

    string public constant TEMPLATE_NAME = "FixedPriceSale";
    address public owner;

    struct SaleInfo {
        IERC20 tokenIn;
        IERC20 tokenOut;
        uint256 tokenPrice;
        uint256 tokensForSale;
        uint256 startDate;
        uint256 endDate;
        uint256 minCommitment;
        uint256 maxCommitment;
        uint256 minRaise;
        bool hasParticipantList;
        address participantList;
    }

    struct SaleStatus {
        uint256 tokensCommitted;
        bool isClosed;
        bool saleSucceeded;
        bool initialized;
    }

    SaleInfo public saleInfo;
    SaleStatus public saleStatus;
    mapping(address => uint256) public commitment;

    modifier onlyOwner {
        require(msg.sender == owner, "FixedPriceSale: FORBIDDEN");
        _;
    }

    /// @dev internal setup function to initialize the template, called by init()
    /// @param _tokenIn token to make the bid in
    /// @param _tokenOut token to buy
    /// @param _tokenPrice fixed token price
    /// @param _tokensForSale amount of tokens to be sold
    /// @param _startDate start date
    /// @param _endDate end date
    /// @param _minCommitment minimum tokenIn to buy
    /// @param _maxCommitment maximum tokenIn to buy
    /// @param _minRaise minimum amount an project is expected to raise, amount of tokenIn
    /// @param _owner owner of the sale
    /// @param _participantList owner of the sale
    function initSale(
        IERC20 _tokenIn,
        IERC20 _tokenOut,
        uint256 _tokenPrice,
        uint256 _tokensForSale,
        uint256 _startDate,
        uint256 _endDate,
        uint256 _minCommitment,
        uint256 _maxCommitment,
        uint256 _minRaise,
        address _owner,
        address _participantList
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
        saleStatus.initialized = true;
        saleInfo.tokenIn = _tokenIn;
        saleInfo.tokenOut = _tokenOut;
        saleInfo.tokenPrice = _tokenPrice;
        saleInfo.tokensForSale = _tokensForSale;
        saleInfo.startDate = _startDate;
        saleInfo.endDate = _endDate;
        saleInfo.minCommitment = _minCommitment;
        saleInfo.maxCommitment = _maxCommitment;
        saleInfo.minRaise = _minRaise;
        if (_participantList != address(0)) {
            saleInfo.participantList = _participantList;
            saleInfo.hasParticipantList = true;
        }
        owner = _owner;
        saleInfo.tokenOut.safeTransferFrom(
            msg.sender,
            address(this),
            saleInfo.tokensForSale
        );

        emit SaleInitialized(
            _tokenIn,
            _tokenOut,
            _tokenPrice,
            _tokensForSale,
            _startDate,
            _endDate,
            _minCommitment,
            _maxCommitment,
            _minRaise,
            _owner,
            _participantList
        );
    }

    /// @dev reserve tokens for a fixed price
    /// @param amount of tokenIn to buy at a fixed price
    function commitTokens(uint256 amount) public {
        require(!saleStatus.isClosed, "FixedPriceSale: sale closed");
        require(
            amount >= saleInfo.minCommitment,
            "FixedPriceSale: amount to low"
        );
        require(
            saleInfo.maxCommitment == 0 ||
                commitment[msg.sender].add(amount) <= saleInfo.maxCommitment,
            "FixedPriceSale: maxCommitment reached"
        );
        require(
            block.timestamp > saleInfo.startDate,
            "FixedPriceSale: sale not started"
        );
        require(
            block.timestamp < saleInfo.endDate,
            "FixedPriceSale: deadline passed"
        );
        require(
            _getTokenAmount(saleStatus.tokensCommitted.add(amount)) <=
                saleInfo.tokensForSale,
            "FixedPriceSale: sale sold out"
        );
        if (saleInfo.hasParticipantList) {
            require(
                IParticipantList(saleInfo.participantList).isInList(msg.sender),
                "FixedPriceSale: account not allowed"
            );
        }
        saleInfo.tokenIn.safeTransferFrom(msg.sender, address(this), amount);
        commitment[msg.sender] = commitment[msg.sender].add(amount);

        saleStatus.tokensCommitted = saleStatus.tokensCommitted.add(amount);
        emit NewCommitment(msg.sender, amount);

        if (isSaleEnded()) {
            closeSale();
        }
    }

    /// @dev close sale if either minRaise is reached or endDate passed
    function closeSale() public {
        require(!saleStatus.isClosed, "FixedPriceSale: already closed");
        require(
            block.timestamp > saleInfo.endDate ||
                _getTokenAmount(saleStatus.tokensCommitted) ==
                saleInfo.tokensForSale,
            "FixedPriceSale: sale cannot be closed"
        );

        saleStatus.isClosed = true;
        if (isMinRaiseReached()) {
            saleStatus.saleSucceeded = true;
            TransferHelper.safeTransfer(
                address(saleInfo.tokenIn),
                owner,
                saleStatus.tokensCommitted
            );
            uint256 soldTokens = _getTokenAmount(saleStatus.tokensCommitted);
            uint256 unsoldTokens = uint256(saleInfo.tokensForSale).sub(
                soldTokens
            );
            if (unsoldTokens > 0) {
                TransferHelper.safeTransfer(
                    address(saleInfo.tokenOut),
                    owner,
                    unsoldTokens
                );
            }
        } else {
            TransferHelper.safeTransfer(
                address(saleInfo.tokenOut),
                owner,
                saleInfo.tokensForSale.sub(
                    _getTokenAmount(saleStatus.tokensCommitted)
                )
            );
        }

        emit SaleClosed();
    }

    /// @dev withdraws purchased tokens if sale successfull, if not releases committed tokens
    function withdrawTokens(address user) public {
        require(commitment[user] > 0, "FixedPriceSale: nothing to withdraw");
        if (isMinRaiseReached()) {
            require(saleStatus.isClosed, "FixedPriceSale: not closed yet");
            uint256 withdrawAmount = _getTokenAmount(commitment[user]);
            commitment[user] = 0;
            TransferHelper.safeTransfer(
                address(saleInfo.tokenOut),
                user,
                withdrawAmount
            );
            emit NewTokenWithdraw(user, withdrawAmount);
        } else {
            require(
                block.timestamp > saleInfo.endDate,
                "FixedPriceSale: endDate not reached"
            );
            uint256 releaseAmount = commitment[user];
            commitment[user] = 0;
            TransferHelper.safeTransfer(
                address(saleInfo.tokenIn),
                user,
                releaseAmount
            );
            emit NewTokenRelease(user, releaseAmount);
        }
    }

    function _getTokenAmount(uint256 _amount) internal view returns (uint256) {
        return _amount.mul(uint256(saleInfo.tokenPrice)).div(1e18);
    }

    function isMinRaiseReached() public view returns (bool) {
        return saleStatus.tokensCommitted >= saleInfo.minRaise;
    }

    function isSaleEnded() public view returns (bool) {
        return
            block.timestamp > saleInfo.endDate ||
            _getTokenAmount(saleStatus.tokensCommitted) ==
            saleInfo.tokensForSale;
    }

    /// @dev init function expexted to be called by SaleLauncher to init the sale
    /// @param _data encoded init params
    function init(bytes calldata _data) public notInitialized {
        (
            IERC20 _tokenIn,
            IERC20 _tokenOut,
            uint256 _tokenPrice,
            uint256 _tokensForSale,
            uint256 _startDate,
            uint256 _endDate,
            uint256 _minCommitment,
            uint256 _maxCommitment,
            uint256 _minRaise,
            address _owner,
            address _participantList
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
                address,
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
            _minCommitment,
            _maxCommitment,
            _minRaise,
            _owner,
            _participantList
        );
    }

    /// @dev withdraw any ERC20 token by owner
    /// @param token ERC20 token address
    /// @param amount Amount to withdraw
    function ERC20Withdraw(address token, uint256 amount) external onlyOwner() {
        require(saleStatus.isClosed, "FixedPriceSale: sale not closed");
        require(
            block.timestamp > saleInfo.endDate,
            "FixedPriceSale: deadline not reached"
        );
        if (saleStatus.saleSucceeded) {
            require(
                token != address(saleInfo.tokenOut),
                "FixedPriceSale: cannot withdraw tokenOut"
            );
        }
        TransferHelper.safeTransfer(token, owner, amount);
    }

    /// @dev withdraw ETH token by owner
    /// @param amount ETH amount to withdraw
    function ETHWithdraw(uint256 amount) external onlyOwner() {
        require(saleStatus.isClosed, "FixedPriceSale: sale not closed");
        require(
            block.timestamp > saleInfo.endDate,
            "FixedPriceSale: deadline not reached"
        );
        TransferHelper.safeTransferETH(owner, amount);
    }

    /// @dev to get remaining token at any point of the sale
    function remainingTokensForSale() public view returns (uint256) {
        return
            saleInfo.tokensForSale.sub(
                _getTokenAmount(saleStatus.tokensCommitted)
            );
    }

    /// @dev to get the remaining time of the sale in seconds
    function secondsRemainingInSale() public view returns (uint256) {
        if (saleInfo.endDate < block.timestamp) {
            return 0;
        }
        return saleInfo.endDate.sub(block.timestamp);
    }

    receive() external payable {}
}
