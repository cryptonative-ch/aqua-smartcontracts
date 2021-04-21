// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../shared/interfaces/ISaleLauncher.sol";
import "../shared/interfaces/IMesaFactory.sol";

contract FairSaleTemplate {
    string public constant templateName = "FairSaleTemplate";
    ISaleLauncher public saleLauncher;
    IMesaFactory public mesaFactory;
    uint256 public saleTemplateId;
    bool initialized = false;
    address tokenSupplier;
    address tokenOut;
    uint256 tokenOutSupply;
    bytes encodedInitData;

    event TemplateInitialized(
        address tokenOut,
        address tokenIn,
        uint256 duration,
        uint256 tokenOutSupply,
        uint96 minPrice,
        uint96 minBuyAmount,
        uint256 minRaise
    );

    constructor() public {}

    /// @dev internal setup function to initialize the template, called by init()
    /// @param _saleLauncher address of Mesa SaleLauncher
    /// @param _saleTemplateId Mesa Auction TemplateId
    /// @param _tokenOut token to be auctioned
    /// @param _tokenIn token to bid on auction
    /// @param _duration auction duration in seconds
    /// @param _tokenOutSupply amount of tokens to be auctioned
    /// @param _minPrice minimum Price that token should be auctioned for
    /// @param _minBuyAmount minimum amount of tokens an investor has to buy
    /// @param _minRaise minimum amount an project is expected to raise
    /// @param _tokenSupplier address that deposits the tokens
    function initTemplate(
        address _saleLauncher,
        uint256 _saleTemplateId,
        address _tokenOut,
        address _tokenIn,
        uint256 _duration,
        uint256 _tokenOutSupply,
        uint96 _minPrice,
        uint96 _minBuyAmount,
        uint256 _minRaise,
        address _tokenSupplier
    ) internal {
        require(!initialized, "FairSaleTemplate: ALEADY_INITIALIZED");

        saleLauncher = ISaleLauncher(_saleLauncher);
        mesaFactory = IMesaFactory(ISaleLauncher(_saleLauncher).factory());
        saleTemplateId = _saleTemplateId;

        uint256 orderCancelationPeriodDuration = 100;
        uint256 minimumBiddingAmountPerOrder = 100;
        bool isAtomicClosureAllowed = false;
        tokenSupplier = _tokenSupplier;
        tokenOut = _tokenOut;
        tokenOutSupply = _tokenOutSupply;

        encodedInitData = abi.encode(
            IERC20(_tokenIn),
            IERC20(_tokenOut),
            orderCancelationPeriodDuration,
            _duration,
            uint96(_tokenOutSupply),
            _minBuyAmount,
            minimumBiddingAmountPerOrder,
            _minRaise,
            isAtomicClosureAllowed
        );

        emit TemplateInitialized(
            _tokenOut,
            _tokenIn,
            _duration,
            _tokenOutSupply,
            _minPrice,
            _minBuyAmount,
            _minRaise
        );
    }

    function createSale() public payable returns (address newSale) {
        require(msg.sender == tokenSupplier, "FairSaleTemplate: FORBIDDEN");
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
    function init(bytes calldata _data) public {
        (
            address _saleLauncher,
            uint256 _saleTemplateId,
            address _tokenOut,
            address _tokenIn,
            uint256 _duration,
            uint256 _tokenOutSupply,
            uint96 _minPrice,
            uint96 _minBuyAmount,
            uint256 _minRaise,
            address _tokenSupplier
        ) =
            abi.decode(
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
                    address
                )
            );

        return
            initTemplate(
                _saleLauncher,
                _saleTemplateId,
                _tokenOut,
                _tokenIn,
                _duration,
                _tokenOutSupply,
                _minPrice,
                _minBuyAmount,
                _minRaise,
                _tokenSupplier
            );
    }
}
