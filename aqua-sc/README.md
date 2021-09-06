# @dxdao/aqua-sc
## Package contains:
- Artifacts used across Aqua infrastructure
- Addresses of deployed contracts
- Typings generated with `typechain/ethers-v5`

## Installation

To install the latest production release use:

```shell 
$ npm install @dxdao/aqua-sc
```
or
```shell 
$ yarn add @dxdao/aqua-sc
```

Development prereleases are following `0.0.0-dev.x` versioning along with `dev` tag. To install the latest dev version, use:
```shell 
$ npm i @dxdao/aqua-sc@>=0.0.0-dev.0 <0.0.0
```
or
```shell
$ yarn add @dxdao/aqua-sc@>=0.0.0-dev.0 <0.0.0
```

## Usage
### Artifacts
```ts
// Import entire artifact
import AQUA_FACTORY from '@dxdao/aqua-sc/artifacts/AquaFactory.json'

// Import abi/bytecode only
import {
  abi as AQUA_FACTORY_ABI,
  bytecode as AQUA_FACTORY__BYTECODE,
} from '@dxdao/aqua-sc/artifacts/AquaFactory.json'
```

### Addresses

```ts
import { getContractAddressesForChainOrThrow, ChainId } from '@dxdao/aqua-sc'

const addresses = getContractAddressesForChainOrThrow(ChainId.rinkeby)

// addresses = {
// 	AquaFactory: "0x8e3f253c2d5048eddb207805ea656bfc80cbd492",
// 	SaleLauncher: "0x8e3f253c2d5048eddb207805ea656bfc80cbd493",
// 	...
// }
```
