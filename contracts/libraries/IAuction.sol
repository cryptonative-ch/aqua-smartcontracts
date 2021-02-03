// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;

interface IAuction {

    function initMarket(
        bytes calldata data
    ) external;
}