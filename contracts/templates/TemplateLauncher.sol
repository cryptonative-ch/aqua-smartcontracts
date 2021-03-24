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
        bool verified;
    }

    uint256 public templateId;
    mapping(uint256 => address) private templates;
    mapping(address => uint256) private templateToId;
    mapping(address => Template) public templateInfo;

    event TemplateLaunched(address indexed auction, uint256 templateId);
    event TemplateAdded(address indexed template, uint256 templateId);
    event TemplateRemoved(address indexed template, uint256 templateId);
    event TemplateVerified(address indexed template, uint256 templateId);
    event UpdatedTemplateRestriction(bool restrictedTemplates);

    address public factory;
    bool public restrictedTemplates = true;

    constructor(address _factory) public {
        factory = _factory;
    }

    /// @dev function to launch a template on Mesa, called from MesaFactory
    /// @param _templateId template to be deployed
    /// @param _data encoded template parameters
    function launchTemplate(uint256 _templateId, bytes calldata _data)
        external
        payable
        returns (address newAuction)
    {
        require(address(msg.sender) == factory, "TemplateLauncher: FORBIDDEN");
        require(
            msg.value >= IMesaFactory(factory).auctionFee(),
            "TemplateLauncher: AUCTION_FEE_NOT_PROVIDED"
        );
        require(
            templates[_templateId] != address(0),
            "TemplateLauncher: INVALID_TEMPLATE"
        );
        newAuction = _deployTemplate(_templateId);
        ITemplate(newAuction).init(_data);
        return address(newAuction);
    }

    /// @dev internal function to clone a template contract
    /// @param _templateId template to be cloned
    function _deployTemplate(uint256 _templateId)
        internal
        returns (address newAuction)
    {
        newAuction = createClone(templates[_templateId]);
        emit TemplateLaunched(address(newAuction), _templateId);
        return address(newAuction);
    }

    /// @dev allows to register a template by paying a fee
    /// @param _template address of template to be added
    function addTemplate(address _template) external payable {
        require(
            !restrictedTemplates || msg.sender == IMesaFactory(factory).templateManager(),
            "TemplateLauncher: FORBIDDEN"
        );
        require(
            msg.value >= IMesaFactory(factory).templateFee(),
            "TemplateLauncher: TEMPLATE_FEE_NOT_PROVIDED"
        );
        require(
            templateToId[_template] == 0,
            "TemplateLauncher: TEMPLATE_DUPLICATE"
        );
        templateId++;
        templates[templateId] = _template;
        templateToId[_template] = templateId;
        emit TemplateAdded(_template, templateId);
    }

    /// @dev allows the templateManager to unregister a template
    /// @param _templateId template to be removed
    function removeTemplate(uint256 _templateId) external {
        require(
            msg.sender == IMesaFactory(factory).templateManager(),
            "TemplateLauncher: FORBIDDEN"
        );
        require(templates[_templateId] != address(0));
        address template = templates[_templateId];
        templates[_templateId] = address(0);
        delete templateToId[template];
        emit TemplateRemoved(template, _templateId);
    }

    /// @dev allows the templateManager to verify a template
    /// @param _templateId template to be verified
    function verifyTemplate(uint256 _templateId) public {
        require(
            msg.sender == IMesaFactory(factory).templateManager(),
            "TemplateLauncher: FORBIDDEN"
        );

        templateInfo[templates[_templateId]].verified = true;
        emit TemplateVerified(templates[_templateId], _templateId);
    }

    /// @dev allows to switch on/off public template registrations
    /// @param _restrictedTemplates turns on/off the option
    function updateTemplateRestriction(bool _restrictedTemplates) external {
        require(msg.sender == IMesaFactory(factory).templateManager(), "TemplateLauncher: FORBIDDEN");
        restrictedTemplates = _restrictedTemplates;
        emit UpdatedTemplateRestriction(_restrictedTemplates);
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
