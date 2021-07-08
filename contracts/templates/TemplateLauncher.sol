// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../shared/interfaces/ITemplate.sol";
import "../shared/interfaces/IAquaFactory.sol";
import "../shared/utils/cloneFactory.sol";

contract TemplateLauncher is CloneFactory {
    using SafeERC20 for IERC20;

    event TemplateLaunched(
        address indexed template,
        uint256 templateId,
        address templateDeployer,
        string metadataContentHash
    );
    event TemplateAdded(address indexed template, uint256 templateId);
    event TemplateRemoved(address indexed template, uint256 templateId);
    event TemplateVerified(address indexed template, uint256 templateId);
    event AllowPublicTemplatesUpdated(bool allowPublicTemplates);
    event TemplateMetadataContentHashUpdated(
        address template,
        string newdetaDataContentHash
    );

    mapping(uint256 => address) private template;
    mapping(address => uint256) private templateToId;
    mapping(address => bool) public templateVerified;

    struct TemplateData {
        address deployer;
        string metadataContentHash;
    }

    mapping(address => TemplateData) public launchedTemplate;

    uint256 templateCounter;
    address public factory;
    address public participantListLaucher;
    bool public allowPublicTemplates;

    modifier isTemplateManager {
        require(
            msg.sender == IAquaFactory(factory).templateManager(),
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
            allowPublicTemplates ||
                msg.sender == IAquaFactory(factory).templateManager(),
            "TemplateLauncher: FORBIDDEN"
        );
        _;
    }

    constructor(address _factory, address _participantListLaucher) public {
        factory = _factory;
        allowPublicTemplates = false;
        participantListLaucher = _participantListLaucher;
    }

    /// @dev function to launch a template on Aqua, called from AquaFactory
    /// @param _templateId template to be deployed
    /// @param _data encoded template parameters
    function launchTemplate(
        uint256 _templateId,
        bytes calldata _data,
        string calldata _metadataContentHash,
        address _templateDeployer
    ) external payable returns (address newTemplate) {
        require(address(msg.sender) == factory, "TemplateLauncher: FORBIDDEN");
        require(
            msg.value >= IAquaFactory(factory).saleFee(),
            "TemplateLauncher: SALE_FEE_NOT_PROVIDED"
        );
        require(
            template[_templateId] != address(0),
            "TemplateLauncher: INVALID_TEMPLATE"
        );
        newTemplate = _deployTemplate(_templateId);
        launchedTemplate[newTemplate] = TemplateData({
            deployer: _templateDeployer,
            metadataContentHash: _metadataContentHash
        });
        emit TemplateLaunched(
            address(newTemplate),
            _templateId,
            _templateDeployer,
            _metadataContentHash
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
            msg.value >= IAquaFactory(factory).templateFee(),
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

    /// @dev allows the template deployer to update the template metadataContentHash
    /// @param _template launched template to be updated
    /// @param _newMetadataContentHash ipfs hash to be set
    function updateTemplateMetadataContentHash(
        address _template,
        string calldata _newMetadataContentHash
    ) external isTemplateDeployer(_template) {
        launchedTemplate[_template]
        .metadataContentHash = _newMetadataContentHash;
        emit TemplateMetadataContentHashUpdated(
            _template,
            _newMetadataContentHash
        );
    }

    function toggleAllowPublicTemplates() external isTemplateManager {
        allowPublicTemplates = !allowPublicTemplates;
        emit AllowPublicTemplatesUpdated(allowPublicTemplates);
    }

    function getTemplate(uint256 _templateId) public view returns (address) {
        return template[_templateId];
    }

    function getTemplateId(address _template) public view returns (uint256) {
        return templateToId[_template];
    }
}
