// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "../interfaces/ISaleLauncher.sol";
import "../interfaces/IMesaFactory.sol";

contract MesaTemplate {
  string public templateName;
  ISaleLauncher public saleLauncher;
  IMesaFactory public mesaFactory;
  uint256 public saleTemplateId;
  bool initialized = false;
  address public tokenSupplier;
  address public tokenOut;
  uint256 public tokenOutSupply;
  bytes public encodedInitData;
}