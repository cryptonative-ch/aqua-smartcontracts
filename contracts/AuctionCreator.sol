// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./interfaces/IAuction.sol";
import "./utils/cloneFactory.sol";

contract AuctionCreator is CloneFactory {
    using SafeERC20 for IERC20;

    event AuctionCreated(address indexed auction, uint256 templateId);
    event TemplateAdded(address indexed template, uint256 templateId);
    event TemplateRemoved(address indexed template, uint256 templateId);

    uint256 public feeNumerator;
    address[] public allAuctions;
    address public feeTo;
    address public feeManager;
    address public templateManager;
    uint256 public auctionFee = 0;
    uint256 public auctionTemplateId;

    mapping(uint256 => address) private auctionTemplates;
    mapping(address => uint256) private auctionTemplateToId;

    constructor(
        address _feeManager,
        address _feeTo,
        uint256 _feeNumerator,
        address _templateManager
    ) public {
        feeManager = _feeManager;
        feeTo = _feeTo;
        feeNumerator = _feeNumerator;
        templateManager = _templateManager;
    }

    function createAuction(uint256 _templateId, bytes calldata _data)
        external
        payable
        returns (address newAuction)
    {
        require(
            msg.value >= auctionFee,
            "AuctionCreator: AUCTION_FEE_NOT_PROVIDED"
        );
        require(
            auctionTemplates[_templateId] != address(0),
            "AuctionCreator: INVALID_TEMPLATE"
        );
        newAuction = _deployAuction(_templateId);
        IAuction(newAuction).initAuction(_data);
        return address(newAuction);
    }

    function _deployAuction(uint256 _templateId)
        internal
        returns (address newAuction)
    {
        newAuction = createClone(auctionTemplates[_templateId]);
        allAuctions.push(address(newAuction));
        emit AuctionCreated(
            address(newAuction),
            _templateId
        );
        return address(newAuction);
    }

    function addAuctionTemplate(address _template) external {
        require(msg.sender == templateManager, "AuctionCreator: FORBIDDEN");
        require(
            auctionTemplateToId[_template] == 0,
            "AuctionCreator: TEMPLATE_DUPLICATE"
        );
        auctionTemplateId++;
        auctionTemplates[auctionTemplateId] = _template;
        auctionTemplateToId[_template] = auctionTemplateId;
        emit TemplateAdded(_template, auctionTemplateId);
    }

    function removeAuctionTemplate(uint256 _templateId) external {
        require(msg.sender == templateManager, "AuctionCreator: FORBIDDEN");
        require(auctionTemplates[_templateId] != address(0));
        address template = auctionTemplates[_templateId];
        auctionTemplates[_templateId] = address(0);
        delete auctionTemplateToId[template];
        emit TemplateRemoved(template, _templateId);
    }

    function setFeeTo(address _feeTo) external {
        require(msg.sender == feeManager, "AuctionCreator: FORBIDDEN");
        feeTo = _feeTo;
    }

    function setFeeNumerator(uint256 _feeNumerator) external {
        require(msg.sender == feeManager, "AuctionCreator: FORBIDDEN");
        feeNumerator = _feeNumerator;
    }

    function setAuctionFee(uint256 _auctionFee) external {
        require(msg.sender == feeManager, "AuctionCreator: FORBIDDEN");
        auctionFee = _auctionFee;
    }

    function setFeeManager(address _feeManager) external {
        require(msg.sender == feeManager, "AuctionCreator: FORBIDDEN");
        feeManager = _feeManager;
    }

    function setTemplateManager(address _templateManager) external {
        require(msg.sender == templateManager, "AuctionCreator: FORBIDDEN");
        templateManager = _templateManager;
    }

    function numberOfAuctions() external view returns (uint256) {
        return allAuctions.length;
    }

    function getTemplate(uint256 _templateId)
        public
        view
        returns (address template)
    {
        return auctionTemplates[_templateId];
    }

    function getTemplateId(address _auctionTemplate)
        public
        view
        returns (uint256)
    {
        return auctionTemplateToId[_auctionTemplate];
    }
}
