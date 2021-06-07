// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../shared/interfaces/ISaleLauncher.sol";
import "../shared/interfaces/IMesaFactory.sol";
import "../shared/utils/MesaTemplate.sol";

contract FixedPriceSaleTemplate is MesaTemplate {
    ISaleLauncher public saleLauncher;
    IMesaFactory public mesaFactory;
    address public templateManager;
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
        uint256 tokenPrice,
        uint256 tokensForSale,
        uint256 startDate,
        uint256 endDate,
        uint256 allocationMin,
        uint256 allocationMax,
        uint256 minimumRaise
    );

    constructor() public {
        templateName = "FixedPriceSaleTemplate";
        metadataContentHash = "0x"; // ToDo
    }

    /// @dev internal setup function to initialize the template, called by init()
    /// @param _saleLauncher address of Mesa SaleLauncher
    /// @param _saleTemplateId Mesa Sale TemplateId
    /// @param _tokenSupplier address that deposits the selling tokens
    /// @param _tokenIn token to buy tokens with
    /// @param _tokenOut token to be sold
    /// @param _tokenPrice price of one tokenOut
    /// @param _tokensForSale amount of tokens to be sold
    /// @param _startDate unix timestamp when the sale starts
    /// @param _endDate unix timestamp when the sale ends
    /// @param _minAllocation minimum amount of tokens an investor needs to purchase
    /// @param _maxAllocation maximum amount of tokens an investor can purchase
    /// @param _minimumRaise sale goal – if not reached investors can claim back tokens
    function initTemplate(
        address _saleLauncher,
        uint256 _saleTemplateId,
        address _tokenSupplier,
        address _tokenIn,
        address _tokenOut,
        uint256 _tokenPrice,
        uint256 _tokensForSale,
        uint256 _startDate,
        uint256 _endDate,
        uint256 _minAllocation,
        uint256 _maxAllocation,
        uint256 _minimumRaise
    ) internal {
        require(!initialized, "FixedPriceSaleTemplate: ALEADY_INITIALIZED");

        saleLauncher = ISaleLauncher(_saleLauncher);
        mesaFactory = IMesaFactory(ISaleLauncher(_saleLauncher).factory());
        templateManager = mesaFactory.templateManager();
        saleTemplateId = _saleTemplateId;
        tokensForSale = _tokensForSale;
        tokenOut = _tokenOut;
        tokenSupplier = _tokenSupplier;
        initialized = true;

        encodedInitData = abi.encode(
            IERC20(_tokenIn),
            IERC20(_tokenOut),
            _tokenPrice,
            _tokensForSale,
            _startDate,
            _endDate,
            _minAllocation,
            _maxAllocation,
            _minimumRaise,
            templateManager
        );

        emit TemplateInitialized(
            _tokenIn,
            _tokenOut,
            _tokenPrice,
            _tokensForSale,
            _startDate,
            _endDate,
            _minAllocation,
            _maxAllocation,
            _minimumRaise
        );
    }

    function createSale() public payable returns (address newSale) {
        require(!saleCreated, "FixedPriceSaleTemplate: Sale already created");
        require(
            msg.sender == tokenSupplier,
            "FixedPriceSaleTemplate: FORBIDDEN"
        );

        newSale = saleLauncher.createSale{value: msg.value}(
            saleTemplateId,
            tokenOut,
            tokensForSale,
            tokenSupplier,
            encodedInitData
        );
    }

    /// @dev setup function expected to be called by templateLauncher to init the template
    /// @param _data encoded template params
    function init(bytes calldata _data) public {
        (
            address _saleLauncher,
            uint256 _saleTemplateId,
            address _tokenOutSupplier,
            address _tokenIn,
            address _tokenOut,
            uint256 _tokenPrice,
            uint256 _tokensForSale,
            uint256 _startDate,
            uint256 _endDate,
            uint256 _minAllocation,
            uint256 _maxAllocation,
            uint256 _minimumRaise
        ) = abi.decode(
            _data,
            (
                address,
                uint256,
                address,
                address,
                address,
                uint256,
                uint256,
                uint256,
                uint256,
                uint256,
                uint256,
                uint256
            )
        );

        initTemplate(
            _saleLauncher,
            _saleTemplateId,
            _tokenOutSupplier,
            _tokenIn,
            _tokenOut,
            _tokenPrice,
            _tokensForSale,
            _startDate,
            _endDate,
            _minAllocation,
            _maxAllocation,
            _minimumRaise
        );
    }
}
