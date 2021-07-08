// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;

interface IAquaFactory {
    function allSales() external view returns (address[] calldata);

    function numberOfSales() external view returns (uint256);

    function templateManager() external view returns (address);

    function templateLauncher() external view returns (address);

    function templateFee() external view returns (uint256);

    function saleFee() external view returns (uint256);

    function feeDenominator() external view returns (uint256);

    function feeNumerator() external view returns (uint256);

    function feeTo() external view returns (address);

    function addTemplate(address _template) external view returns (uint256);
}
