// SPDX-License-Identifier: LGPL-3.0
pragma solidity >=0.6.8;

interface IParticipantListLauncher {
    function launchParticipantList(address[] memory managers)
        external
        returns (address newList);
}
