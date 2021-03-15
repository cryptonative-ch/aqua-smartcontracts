// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;

interface IMesaFactory {
    function allAuctions() external view returns (address[] calldata);

    function numberOfAuctions() external view returns (uint256);

    function templateManager() external view returns (address);

    function auctionFee() external view returns (uint256);

    function feeDenominator() external view returns (uint256);

    function feeNumerator() external view returns (uint256);

    function feeTo() external view returns (address);

    function addTemplate(address _template) external view returns (uint256);

    function addAuction(address _auction, uint256 _templateId)
        external
        view
        returns (uint256);
}
