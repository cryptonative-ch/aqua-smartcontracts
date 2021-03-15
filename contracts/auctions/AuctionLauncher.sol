// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interfaces/IAuction.sol";
import "../interfaces/IMesaFactory.sol";
import "../libraries/TransferHelper.sol";
import "../utils/cloneFactory.sol";

contract AuctionLauncher is CloneFactory {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    struct Auction {
        bool exists;
        uint64 templateId;
        uint128 index;
    }

    address[] public auctions;
    uint256 public auctionTemplateId;
    mapping(uint256 => address) private auctionTemplates;
    mapping(address => uint256) private auctionauctionTemplateToId;
    mapping(address => Auction) public auctionInfo;

    event TemplateAdded(address indexed template, uint256 templateId);
    event TemplateRemoved(address indexed template, uint256 templateId);
    event AuctionLaunched(address indexed auction, uint256 templateId);
    event AuctionInitialized(
        address indexed auction,
        uint256 templateId,
        bytes data
    );

    address public factory;

    mapping(address => uint256) private auctionTemplateToId;

    constructor(address _factory) public {
        factory = _factory;
    }

    function createAuction(
        uint256 _templateId,
        address _token,
        uint256 _tokenSupply,
        bytes calldata _data
    ) external payable returns (address newAuction) {
        require(
            msg.value >= IMesaFactory(factory).auctionFee(),
            "AuctionCreator: AUCTION_FEE_NOT_PROVIDED"
        );
        require(
            auctionTemplates[_templateId] != address(0),
            "AuctionCreator: INVALID_TEMPLATE"
        );

        newAuction = _deployAuction(_templateId);

        if (_tokenSupply > 0) {
            uint256 feeDenominator = IMesaFactory(factory).feeDenominator();
            uint256 feeNumerator = IMesaFactory(factory).feeNumerator();

            uint256 depositAmount =
                _tokenSupply.mul(feeDenominator.add(feeNumerator)).div(
                    feeDenominator
                );

            TransferHelper.safeTransferFrom(
                _token,
                msg.sender,
                address(this),
                depositAmount
            );
            TransferHelper.safeApprove(_token, newAuction, _tokenSupply);
            TransferHelper.safeTransfer(
                _token,
                IMesaFactory(factory).feeTo(),
                depositAmount.sub(_tokenSupply)
            );
        }
        //IAuction(newAuction).initAuction(_data);
        emit AuctionInitialized(newAuction, _templateId, _data);
        return address(newAuction);
    }

    function _deployAuction(uint256 _templateId)
        internal
        returns (address newAuction)
    {
        newAuction = createClone(auctionTemplates[_templateId]);
        auctionInfo[address(newAuction)] = Auction(
            true,
            uint64(_templateId),
            uint128(auctions.length)
        );
        auctions.push(address(newAuction));
        //IMesaFactory(factory).addAuction(address(newAuction), _templateId);
        emit AuctionLaunched(address(newAuction), _templateId);
        return address(newAuction);
    }

    function addTemplate(address _template) external returns (uint256) {
        require(
            msg.sender == IMesaFactory(factory).templateManager(),
            "AuctionCreator: FORBIDDEN"
        );
        require(
            auctionTemplateToId[_template] == 0,
            "AuctionCreator: TEMPLATE_DUPLICATE"
        );

        auctionTemplateId++;
        auctionTemplates[auctionTemplateId] = _template;
        auctionauctionTemplateToId[_template] = auctionTemplateId;
        emit TemplateAdded(_template, auctionTemplateId);
        return auctionTemplateId;
    }

    function removeTemplate(uint256 _templateId) external {
        require(
            msg.sender == IMesaFactory(factory).templateManager(),
            "AuctionCreator: FORBIDDEN"
        );
        require(auctionTemplates[_templateId] != address(0));
        address template = auctionTemplates[_templateId];
        auctionTemplates[_templateId] = address(0);
        delete auctionTemplateToId[template];
        emit TemplateRemoved(template, _templateId);
    }

    function getTemplate(uint256 _templateId)
        public
        view
        returns (address template)
    {
        return auctionTemplates[_templateId];
    }

    function getTemplateId(address _template) public view returns (uint256) {
        return auctionTemplateToId[_template];
    }

    function getDepositAmountWithFees(uint256 _tokenSupply)
        public
        view
        returns (uint256)
    {
        uint256 feeDenominator = IMesaFactory(factory).feeDenominator();
        uint256 feeNumerator = IMesaFactory(factory).feeNumerator();
        return
            _tokenSupply.mul(feeDenominator.add(feeNumerator)).div(
                feeDenominator
            );
    }

    function numberOfAuctions() public view returns (uint256) {
        return auctions.length;
    }
}
