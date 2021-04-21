// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../shared/interfaces/ITemplate.sol";
import "../shared/interfaces/IMesaFactory.sol";
import "../shared/utils/cloneFactory.sol";

contract TemplateLauncher is CloneFactory {
    using SafeERC20 for IERC20;

    mapping(uint256 => address) private templates;
    mapping(address => uint256) private templateToId;
    mapping(address => bool) private templateVerified;

    event TemplateLaunched(address indexed sale, uint256 templateId);
    event TemplateAdded(address indexed template, uint256 templateId);
    event TemplateRemoved(address indexed template, uint256 templateId);
    event TemplateVerified(address indexed template, uint256 templateId);
    event TemplateRestrictionUpdated(bool restrictedTemplates);

    address public factory;
    bool public restrictedTemplates = true;

    modifier isTemplateManager() {
        require(
            msg.sender == IMesaFactory(factory).templateManager(),
            "MesaFactory: FORBIDDEN"
        );
        _;
    }

    modifier isAllowedToAddTemplate() {
        require(
            !restrictedTemplates ||
                msg.sender == IMesaFactory(factory).templateManager(),
            "MesaFactory: FORBIDDEN"
        );
        _;
    }

    constructor(address _factory) public {
        factory = _factory;
    }

    /// @dev function to launch a template on Mesa, called from MesaFactory
    /// @param _templateId template to be deployed
    /// @param _data encoded template parameters
    function launchTemplate(uint256 _templateId, bytes calldata _data)
        external
        payable
        returns (address newSale)
    {
        require(address(msg.sender) == factory, "TemplateLauncher: FORBIDDEN");
        require(
            msg.value >= IMesaFactory(factory).saleFee(),
            "TemplateLauncher: SALE_FEE_NOT_PROVIDED"
        );
        require(
            templates[_templateId] != address(0),
            "TemplateLauncher: INVALID_TEMPLATE"
        );
        newSale = _deployTemplate(_templateId);
        ITemplate(newSale).init(_data);
    }

    /// @dev internal function to clone a template contract
    /// @param _templateId template to be cloned
    function _deployTemplate(uint256 _templateId)
        internal
        returns (address newSale)
    {
        newSale = createClone(templates[_templateId]);
        emit TemplateLaunched(address(newSale), _templateId);
    }

    /// @dev allows to register a template by paying a fee
    /// @param _template address of template to be added
    function addTemplate(address _template)
        external
        payable
        isAllowedToAddTemplate()
        returns (uint256)
    {
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
        return templateId;
    }

    /// @dev allows the templateManager to unregister a template
    /// @param _templateId template to be removed
    function removeTemplate(uint256 _templateId) external isTemplateManager() {
        require(templates[_templateId] != address(0));
        address template = templates[_templateId];
        templates[_templateId] = address(0);
        delete templateToId[template];
        emit TemplateRemoved(template, _templateId);
    }

    /// @dev allows the templateManager to verify a template
    /// @param _templateId template to be verified
    function verifyTemplate(uint256 _templateId) external isTemplateManager() {
        templateVerified[templates[_templateId]] = true;
        emit TemplateVerified(templates[_templateId], _templateId);
    }

    /// @dev allows to switch on/off public template registrations
    /// @param _restrictedTemplates turns on/off the option
    function updateTemplateRestriction(bool _restrictedTemplates)
        external
        isTemplateManager()
    {
        restrictedTemplates = _restrictedTemplates;
        emit TemplateRestrictionUpdated(_restrictedTemplates);
    }

    function getTemplate(uint256 _templateId) public view returns (address) {
        return templates[_templateId];
    }

    function getTemplateId(address _template) public view returns (uint256) {
        return templateToId[_template];
    }
}
