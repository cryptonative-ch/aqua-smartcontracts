// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../shared/interfaces/ISaleLauncher.sol";
import "../shared/interfaces/IMesaFactory.sol";
import "../shared/utils/MesaTemplate.sol";

contract FixedPriceSaleTemplate is MesaTemplate {
    event TemplateInitialized(
        address tokenOut,
        address tokenIn,
        uint256 tokenPrice,
        uint256 tokensForSale,
        uint256 startDate,
        uint256 endDate,
        uint256 allocationMin,
        uint256 allocationMax,
        uint256 minimumRaise,
        address owner
    );

    constructor() public {
      templateName = "FixedPriceSaleTemplate";
    }

    /// @dev internal setup function to initialize the template, called by init()
    /// @param _saleLauncher address of Mesa SaleLauncher
    /// @param _saleTemplateId Mesa Sale TemplateId
    /// @param _tokenSupplier address that deposits the selling tokens
    /// @param _tokenOut token to be sold
    /// @param _tokenIn token to buy tokens with
    /// @param _tokenPrice price of one tokenOut
    /// @param _tokensForSale amount of tokens to be sold
    /// @param _startDate unix timestamp when the sale starts
    /// @param _endDate unix timestamp when the sale ends
    /// @param _allocationMin minimum amount of tokens an investor needs to purchase
    /// @param _allocationMax maximum amount of tokens an investor can purchase
    /// @param _minimumRaise sale goal – if not reached investors can claim back tokens
    /// @param _owner address for privileged functions
    function initTemplate(
        address _saleLauncher,
        uint256 _saleTemplateId,
        address _tokenSupplier,
        address _tokenOut,
        address _tokenIn,
        uint256 _tokenPrice,
        uint256 _tokensForSale,
        uint256 _startDate,
        uint256 _endDate,
        uint256 _allocationMin,
        uint256 _allocationMax,
        uint256 _minimumRaise,
        address _owner
    ) internal {
        require(!initialized, "FixedPriceSaleTemplate: ALEADY_INITIALIZED");

        saleLauncher = ISaleLauncher(_saleLauncher);
        mesaFactory = IMesaFactory(ISaleLauncher(_saleLauncher).factory());
        saleTemplateId = _saleTemplateId;
        tokenOutSupply = _tokensForSale;
        tokenOut = _tokenOut;
        tokenSupplier = _tokenSupplier;

        encodedInitData = abi.encode(
            IERC20(_tokenIn),
            IERC20(_tokenOut),
            _tokenPrice,
            _tokensForSale,
            _startDate,
            _endDate,
            _allocationMin,
            _allocationMax,
            _minimumRaise,
            _owner
        );

        initialized = true;

        emit TemplateInitialized(
            _tokenOut,
            _tokenIn,
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

    function createSale() public payable returns (address newSale) {
        require(
            msg.sender == tokenSupplier,
            "FixedPriceSaleTemplate: FORBIDDEN"
        );
        newSale = saleLauncher.createSale{value: msg.value}(
            saleTemplateId,
            tokenOut,
            tokenOutSupply,
            tokenSupplier,
            encodedInitData
        );
    }

    /// @dev setup function expexted to be called by templateLauncher to init the template
    /// @param _data encoded template params
    /// ToDo: Explore more generic approach & use .call
    function init(bytes calldata _data) public {
        (
            address _saleLauncher,
            uint256 _saleTemplateId,
            address _tokenOutSupplier,
            address _tokenOut,
            address _tokenIn,
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
                    uint256,
                    address
                )
            );

        initTemplate(
            _saleLauncher,
            _saleTemplateId,
            _tokenOutSupplier,
            _tokenOut,
            _tokenIn,
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
}