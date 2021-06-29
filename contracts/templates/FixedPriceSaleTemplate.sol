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
    bool public isInitialized;
    bool public isSaleCreated;

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
        metaDataContentHash = "0x"; // ToDo
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
    /// @param _minCommitment minimum tokenIn to buy
    /// @param _maxCommitment maximum tokenIn to buy
    /// @param _minRaise sale goal,if not reached investors can claim back their committed tokens
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
        uint256 _minCommitment,
        uint256 _maxCommitment,
        uint256 _minRaise
    ) internal {
        require(!isInitialized, "FixedPriceSaleTemplate: ALEADY_INITIALIZED");

        saleLauncher = ISaleLauncher(_saleLauncher);
        mesaFactory = IMesaFactory(ISaleLauncher(_saleLauncher).factory());
        templateManager = mesaFactory.templateManager();
        saleTemplateId = _saleTemplateId;
        tokensForSale = _tokensForSale;
        tokenOut = _tokenOut;
        tokenSupplier = _tokenSupplier;
        isInitialized = true;

        encodedInitData = abi.encode(
            IERC20(_tokenIn),
            IERC20(_tokenOut),
            _tokenPrice,
            _tokensForSale,
            _startDate,
            _endDate,
            _minCommitment,
            _maxCommitment,
            _minRaise,
            templateManager
        );

        emit TemplateInitialized(
            _tokenIn,
            _tokenOut,
            _tokenPrice,
            _tokensForSale,
            _startDate,
            _endDate,
            _minCommitment,
            _maxCommitment,
            _minRaise
        );
    }

    function createSale() public payable returns (address newSale) {
        require(!isSaleCreated, "FixedPriceSaleTemplate: Sale already created");
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
            address _tokenSupplier,
            address _tokenIn,
            address _tokenOut,
            uint256 _tokenPrice,
            uint256 _tokensForSale,
            uint256 _startDate,
            uint256 _endDate,
            uint256 _minCommitment,
            uint256 _maxCommitment,
            uint256 _minRaise
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
            _tokenSupplier,
            _tokenIn,
            _tokenOut,
            _tokenPrice,
            _tokensForSale,
            _startDate,
            _endDate,
            _minCommitment,
            _maxCommitment,
            _minRaise
        );
    }
}
