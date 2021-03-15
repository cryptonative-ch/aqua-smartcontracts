// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../interfaces/ITemplate.sol";
import "../interfaces/IMesaFactory.sol";
import "../utils/cloneFactory.sol";

contract TemplateLauncher is CloneFactory {
    using SafeERC20 for IERC20;

    struct Template {
        bool exists;
        uint64 templateId;
        uint128 index;
    }

    uint256 public templateId;
    mapping(uint256 => address) private templates;
    mapping(address => uint256) private templateToId;
    mapping(address => Template) public templateInfo;

    event TemplateLaunched(address indexed auction, uint256 templateId);
    event TemplateAdded(address indexed template, uint256 templateId);
    event TemplateRemoved(address indexed template, uint256 templateId);

    address public factory;

    constructor(address _factory) public {
        factory = _factory;
    }

    function launchTemplate(uint256 _templateId, bytes calldata _data)
        external
        payable
        returns (address newAuction)
    {
        require(address(msg.sender) == factory, "AuctionCreator: FORBIDDEN");
        require(
            msg.value >= IMesaFactory(factory).auctionFee(),
            "AuctionCreator: AUCTION_FEE_NOT_PROVIDED"
        );
        require(
            templates[_templateId] != address(0),
            "AuctionCreator: INVALID_TEMPLATE"
        );
        newAuction = _deployTemplate(_templateId);
        ITemplate(newAuction).init(_data);
        return address(newAuction);
    }

    function _deployTemplate(uint256 _templateId)
        internal
        returns (address newAuction)
    {
        newAuction = createClone(templates[_templateId]);
        emit TemplateLaunched(address(newAuction), _templateId);
        return address(newAuction);
    }

    function addTemplate(address _template) external {
        require(
            msg.sender == IMesaFactory(factory).templateManager(),
            "AuctionCreator: FORBIDDEN"
        );
        require(
            templateToId[_template] == 0,
            "AuctionCreator: TEMPLATE_DUPLICATE"
        );
        templateId++;
        templates[templateId] = _template;
        templateToId[_template] = templateId;
        emit TemplateAdded(_template, templateId);
    }

    function removeTemplate(uint256 _templateId) external {
        require(
            msg.sender == IMesaFactory(factory).templateManager(),
            "AuctionCreator: FORBIDDEN"
        );
        require(templates[_templateId] != address(0));
        address template = templates[_templateId];
        templates[_templateId] = address(0);
        delete templateToId[template];
        emit TemplateRemoved(template, _templateId);
    }

    function getTemplate(uint256 _templateId)
        public
        view
        returns (address template)
    {
        return templates[_templateId];
    }

    function getTemplateId(address _template) public view returns (uint256) {
        return templateToId[_template];
    }
}
