// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../shared/interfaces/ITemplate.sol";
import "../shared/interfaces/IMesaFactory.sol";
import "../shared/utils/cloneFactory.sol";

contract TemplateLauncher is CloneFactory {
    using SafeERC20 for IERC20;

    event TemplateLaunched(
        address indexed newTemplate,
        uint256 templateId,
        address templatedeployer,
        bytes metaData
    );
    event TemplateAdded(address indexed template, uint256 templateId);
    event TemplateRemoved(address indexed template, uint256 templateId);
    event TemplateVerified(address indexed template, uint256 templateId);
    event TemplateRestrictionUpdated(bool restrictedTemplates);
    event TemplateMetaDataUpdated(
        address _launchedTemplate,
        bytes _newMetaData
    );

    mapping(uint256 => address) private template;
    mapping(address => uint256) private templateToId;
    mapping(address => bool) public templateVerified;

    struct TemplateData {
        address deployer;
        bytes metaData;
    }

    mapping(address => TemplateData) public launchedTemplate;

    uint256 templateCounter;
    address public factory;
    bool public restrictedTemplates;

    modifier isTemplateManager {
        require(
            msg.sender == IMesaFactory(factory).templateManager(),
            "TemplateLauncher: FORBIDDEN"
        );
        _;
    }

    modifier isTemplateDeployer(address _template) {
        require(
            msg.sender == launchedTemplate[_template].deployer,
            "TemplateLauncher: FORBIDDEN"
        );
        _;
    }

    modifier isAllowedToAddTemplate {
        require(
            !restrictedTemplates ||
                msg.sender == IMesaFactory(factory).templateManager(),
            "TemplateLauncher: FORBIDDEN"
        );
        _;
    }

    constructor(address _factory) public {
        factory = _factory;
        restrictedTemplates = true;
    }

    /// @dev function to launch a template on Mesa, called from MesaFactory
    /// @param _templateId template to be deployed
    /// @param _data encoded template parameters
    function launchTemplate(
        uint256 _templateId,
        bytes calldata _data,
        bytes calldata _metaData,
        address _templateDeployer
    ) external payable returns (address newTemplate) {
        require(address(msg.sender) == factory, "TemplateLauncher: FORBIDDEN");
        require(
            msg.value >= IMesaFactory(factory).saleFee(),
            "TemplateLauncher: SALE_FEE_NOT_PROVIDED"
        );
        require(
            template[_templateId] != address(0),
            "TemplateLauncher: INVALID_TEMPLATE"
        );
        newTemplate = _deployTemplate(_templateId);
        launchedTemplate[newTemplate] = TemplateData({
            deployer: _templateDeployer,
            metaData: _metaData
        });
        emit TemplateLaunched(
            address(newTemplate),
            _templateId,
            _templateDeployer,
            _metaData
        );
        ITemplate(newTemplate).init(_data);
    }

    /// @dev internal function to clone a template contract
    /// @param _templateId template to be cloned
    function _deployTemplate(uint256 _templateId)
        internal
        returns (address newTemplate)
    {
        newTemplate = createClone(template[_templateId]);
    }

    /// @dev allows to register a template by paying a fee
    /// @param _template address of template to be added
    function addTemplate(address _template)
        external
        payable
        isAllowedToAddTemplate
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

        uint256 templateId = templateCounter;
        templateCounter++;
        template[templateCounter] = _template;
        templateToId[_template] = templateCounter;
        emit TemplateAdded(_template, templateCounter);
        return templateId;
    }

    /// @dev allows the templateManager to unregister a template
    /// @param _templateId template to be removed
    function removeTemplate(uint256 _templateId) external isTemplateManager {
        require(template[_templateId] != address(0));
        address templateAddress = template[_templateId];
        template[_templateId] = address(0);
        delete templateToId[templateAddress];
        emit TemplateRemoved(templateAddress, _templateId);
    }

    /// @dev allows the templateManager to verify a template
    /// @param _templateId template to be verified
    function verifyTemplate(uint256 _templateId) external isTemplateManager {
        templateVerified[template[_templateId]] = true;
        emit TemplateVerified(template[_templateId], _templateId);
    }

    /// @dev allows the template deployer to update the template metadata
    /// @param _template launched template to be updated
    /// @param _newMetaData ipfs hash to be set
    function updateTemplateMetadata(
        address _template,
        bytes calldata _newMetaData
    ) external isTemplateDeployer(_template) {
        launchedTemplate[_template].metaData = _newMetaData;
        emit TemplateMetaDataUpdated(_template, _newMetaData);
    }

    /// @dev allows to switch on/off public template registrations
    /// @param _restrictedTemplates turns on/off the option
    function updateTemplateRestriction(bool _restrictedTemplates)
        external
        isTemplateManager
    {
        restrictedTemplates = _restrictedTemplates;
        emit TemplateRestrictionUpdated(_restrictedTemplates);
    }

    function getTemplate(uint256 _templateId) public view returns (address) {
        return template[_templateId];
    }

    function getTemplateId(address _template) public view returns (uint256) {
        return templateToId[_template];
    }
}
