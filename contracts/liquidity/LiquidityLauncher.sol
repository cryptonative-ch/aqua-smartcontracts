// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;

import "../utils/cloneFactory.sol";

contract LiquidityLauncher is CloneFactory {
    bool private initialised;
    address[] public launchers;
    uint256 public launcherTemplateId;
    address public WETH;

    mapping(uint256 => address) private launcherTemplates;
    mapping(address => uint256) private launcherTemplateIds;

    mapping(address => bool) public isChildLiquidityLauncher;

    event InitLiquidityLauncher(address sender);

    event LiquidityLauncherCreated(
        address indexed owner,
        address indexed addr,
        address launcherTemplate
    );

    event LiquidityTemplateAdded(address newLauncher, uint256 templateId);

    event LiquidityTemplateRemoved(address launcher, uint256 templateId);

    constructor() public {}

    function initLiquidityLauncher(address _WETH) external {
        require(!initialised);
        initialised = true;
        WETH = _WETH;
        emit InitLiquidityLauncher(msg.sender);
    }

    function createLiquidityLauncher(uint256 _templateId)
        external
        returns (address launcher)
    {
        require(
            launcherTemplates[_templateId] != address(0),
            "PoolLiquidity: INVALID_TEMPLATE"
        );

        launcher = createClone(launcherTemplates[_templateId]);
        isChildLiquidityLauncher[address(launcher)] = true;
        launchers.push(address(launcher));

        emit LiquidityLauncherCreated(
            msg.sender,
            address(launcher),
            launcherTemplates[_templateId]
        );
    }

    function addLiquidityLauncherTemplate(address _template) external {
        // ToDo: Check permissions & prevent duplicate
        launcherTemplateId++;
        launcherTemplates[launcherTemplateId] = _template;
        launcherTemplateIds[_template] = launcherTemplateId;
        emit LiquidityTemplateAdded(_template, launcherTemplateId);
    }

    function removeLiquidityLauncherTemplate(uint256 _templateId) external {
        // ToDo: Check permissions
        require(launcherTemplates[_templateId] != address(0));
        address template = launcherTemplates[_templateId];
        launcherTemplates[_templateId] = address(0);
        emit LiquidityTemplateRemoved(template, _templateId);
    }

    function getLiquidityLauncherTemplate(uint256 templateId)
        public
        view
        returns (address launcherTemplate)
    {
        return launcherTemplates[templateId];
    }

    function numberOfLiquidityLaunchers() public view returns (uint256) {
        return launchers.length;
    }

    function getTemplateId(address _launcherTemplate)
        public
        view
        returns (uint256)
    {
        return launcherTemplateIds[_launcherTemplate];
    }
}
