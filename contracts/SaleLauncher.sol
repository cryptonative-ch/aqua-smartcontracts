// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./interfaces/IAuction.sol";
import "./interfaces/IMesaFactory.sol";
import "./utils/cloneFactory.sol";

contract SaleLauncher is CloneFactory {
    using SafeERC20 for IERC20;

    event AuctionCreated(address indexed auction, uint256 templateId);
    event TemplateAdded(address indexed template, uint256 templateId);
    event TemplateRemoved(address indexed template, uint256 templateId);

    address public factory;
    address public templateManager;

    mapping(uint256 => address) private templates;
    mapping(address => uint256) private templateToId;

    constructor(address _factory) public {
        factory = _factory;
    }

    function createAuction(uint256 _templateId, bytes calldata _data)
        external
        payable
        returns (address newAuction)
    {
        require(
            msg.value >= IMesaFactory(factory).auctionFee(),
            "AuctionCreator: AUCTION_FEE_NOT_PROVIDED"
        );
        require(
            templates[_templateId] != address(0),
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
        newAuction = createClone(templates[_templateId]);
        IMesaFactory(factory).addAuction(address(newAuction), _templateId);
        emit AuctionCreated(address(newAuction), _templateId);
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
        uint256 templateId = IMesaFactory(factory).addTemplate(_template);
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
