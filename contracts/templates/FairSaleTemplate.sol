// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../shared/interfaces/ISaleLauncher.sol";
import "../shared/interfaces/IMesaFactory.sol";
import "../shared/utils/MesaTemplate.sol";

contract FairSaleTemplate is MesaTemplate {
    ISaleLauncher public saleLauncher;
    IMesaFactory public mesaFactory;
    uint256 public saleTemplateId;
    address public tokenSupplier;
    address public tokenOut;
    uint256 public tokensForSale;
    bytes public encodedInitData;
    bool initialized = false;
    bool saleCreated = false;

    event TemplateInitialized(
        address tokenIn,
        address tokenOut,
        uint256 duration,
        uint256 tokensForSale,
        uint96 minPrice,
        uint96 minBuyAmount,
        uint256 minRaise,
        uint256 orderCancelationPeriodDuration,
        uint256 minimumBiddingAmountPerOrder
    );

    constructor() public {
        templateName = "FairSaleTemplate";
        metadataContentHash = "0x"; // ToDo
    }

    /// @dev internal setup function to initialize the template, called by init()
    /// @param _saleLauncher address of Mesa SaleLauncher
    /// @param _saleTemplateId Mesa Auction TemplateId
    /// @param _tokenIn token to bid on auction
    /// @param _tokenOut token to be auctioned
    /// @param _duration auction duration in seconds
    /// @param _tokensForSale amount of tokens to be auctioned
    /// @param _minPrice minimum Price that token should be auctioned for
    /// @param _minBuyAmount minimum amount of tokens an investor has to buy
    /// @param _minRaise minimum amount an project is expected to raise
    /// @param _tokenSupplier address that deposits the tokens
    function initTemplate(
        address _saleLauncher,
        uint256 _saleTemplateId,
        address _tokenIn,
        address _tokenOut,
        uint256 _duration,
        uint256 _tokensForSale,
        uint96 _minPrice,
        uint96 _minBuyAmount,
        uint256 _minRaise,
        uint256 _orderCancelationPeriodDuration,
        uint256 _minimumBiddingAmountPerOrder,
        address _tokenSupplier
    ) internal {
        require(!initialized, "FairSaleTemplate: ALEADY_INITIALIZED");

        saleLauncher = ISaleLauncher(_saleLauncher);
        mesaFactory = IMesaFactory(ISaleLauncher(_saleLauncher).factory());
        saleTemplateId = _saleTemplateId;

        bool isAtomicClosureAllowed = false;
        tokenSupplier = _tokenSupplier;
        tokenOut = _tokenOut;
        tokensForSale = _tokensForSale;

        encodedInitData = abi.encode(
            IERC20(_tokenIn),
            IERC20(_tokenOut),
            _orderCancelationPeriodDuration,
            _duration,
            uint96(_tokensForSale),
            _minBuyAmount,
            _minimumBiddingAmountPerOrder,
            _minRaise,
            isAtomicClosureAllowed
        );

        emit TemplateInitialized(
            _tokenIn,
            _tokenOut,
            _duration,
            _tokensForSale,
            _minPrice,
            _minBuyAmount,
            _minRaise,
            _orderCancelationPeriodDuration,
            _minimumBiddingAmountPerOrder
        );
    }

    function createSale() public payable returns (address newSale) {
        require(!saleCreated, "FairSaleTemplate: Sale already created");
        require(msg.sender == tokenSupplier, "FairSaleTemplate: FORBIDDEN");
        newSale = saleLauncher.createSale{value: msg.value}(
            saleTemplateId,
            tokenOut,
            tokensForSale,
            tokenSupplier,
            encodedInitData
        );
    }

    /// @dev setup function expexted to be called by templateLauncher to init the template
    /// @param _data encoded template params
    function init(bytes calldata _data) public {
        (
            address _saleLauncher,
            uint256 _saleTemplateId,
            address _tokenIn,
            address _tokenOut,
            uint256 _duration,
            uint256 _tokensForSale,
            uint96 _minPrice,
            uint96 _minBuyAmount,
            uint256 _minRaise,
            uint256 _orderCancelationPeriodDuration,
            uint256 _minimumBiddingAmountPerOrder,
            address _tokenSupplier
        ) = abi.decode(
            _data,
            (
                address,
                uint256,
                address,
                address,
                uint256,
                uint256,
                uint96,
                uint96,
                uint256,
                uint256,
                uint256,
                address
            )
        );

        return
            initTemplate(
                _saleLauncher,
                _saleTemplateId,
                _tokenIn,
                _tokenOut,
                _duration,
                _tokensForSale,
                _minPrice,
                _minBuyAmount,
                _minRaise,
                _orderCancelationPeriodDuration,
                _minimumBiddingAmountPerOrder,
                _tokenSupplier
            );
    }
}
