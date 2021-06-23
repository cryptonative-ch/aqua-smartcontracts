// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;

interface ITemplateLauncher {
    function launchTemplate(
        uint256 _templateId,
        bytes calldata _data,
        string calldata _metaData,
        address _templateDeployer
    ) external payable returns (address newSale);
}
