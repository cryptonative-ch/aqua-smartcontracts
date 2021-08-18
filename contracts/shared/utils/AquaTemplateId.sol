// SPDX-License-Identifier: LGPL-3.0
pragma solidity >=0.6.8;

contract AquaTemplateId {
    // ITemplate.init.selector ^ ITemplate.templateName.selector
    bytes4 internal constant _INTERFACE_ID_TEMPLATE = 0x242c4805;
}
