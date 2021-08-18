// SPDX-License-Identifier: LGPL-3.0
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/introspection/ERC165.sol";
import "./AquaTemplateId.sol";

abstract contract AquaTemplate is ERC165, AquaTemplateId {
    string public templateName;
    string public metaDataContentHash;

    function init(bytes calldata data) external virtual;

    constructor() public {
        _registerInterface(_INTERFACE_ID_TEMPLATE);
    }
}
