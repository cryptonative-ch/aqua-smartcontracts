// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;

interface IAuctionLauncher {
    function createAuction(
        uint256 _templateId,
        address _tokenOut,
        uint256 _tokenOutSupply,
        bytes calldata _data
    ) external view returns (address);
}
