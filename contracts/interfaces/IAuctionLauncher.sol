// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;

interface IAuctionLauncher {
    function factory() external view returns (address);

    function createAuction(
        uint256 _templateId,
        address _token,
        uint256 _tokenSupply,
        bytes calldata _data
    ) external view returns (address);

    function getDepositAmountWithFees(uint256 _tokenSupply)
        external
        view
        returns (uint256);
}
