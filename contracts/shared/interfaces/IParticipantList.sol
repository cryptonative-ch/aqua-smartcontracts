// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;

interface IParticipantList {
    function isInList(address account) external view returns (bool);

    function setParticipantAmounts(
        address[] memory accounts,
        uint256[] memory amounts
    ) external;

    function initialized() external view returns (bool);
}
