// SPDX-License-Identifier: LGPL-3.0
pragma solidity >=0.6.8;

interface ITemplate {
    function templateName() external;

    function init(bytes calldata data) external;
}
