# Aqua-sc
## Package contains:
- artifacts used across Aqua intrastructure,
- addresses of deployed contracts,
- typings generated with `typechain/ethers-v5`

## Installation

To install latest production release use:

```shell 
$ npm install aqua-sc
```
or
```shell 
$ yarn add aqua-sc
```

Development prereleases are following `0.0.0-dev.x` versioning along with `dev` tag. 
To install latest dev version, use:
```shell 
$ npm i aqua-sc@>=0.0.0-dev.0 <0.0.0
```
or
```shell 
$ yarn add aqua-sc@>=0.0.0-dev.0 <0.0.0
```

## Usage
### Artifacts
```ts
// Import entire artifact
import AQUA_FACTORY from 'aqua-sc/artifacts/AquaFactory.json'

// Import abi/bytecode only
import {
  abi as AQUA_FACTORY_ABI,
  bytecode as AQUA_FACTORY__BYTECODE,
} from 'aqua-sc/artifacts/AquaFactory.json'
```

### Addresses

```ts
import { getContractAddressesForChainOrThrow, ChainId } from 'aqua-sc'

const addresses = getContractAddressesForChainOrThrow(ChainId.rinkeby)

// addresses = {
// 	AquaFactory: "0x8e3f253c2d5048eddb207805ea656bfc80cbd492",
// 	SaleLauncher: "0x8e3f253c2d5048eddb207805ea656bfc80cbd493",
// 	...
// }
```
