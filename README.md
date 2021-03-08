# Mesa Contracts

## Getting started
To run the tests, follow these steps. You must have at least node v10 and [yarn](https://yarnpkg.com/) installed.

First clone the repository:

```sh
git clone https://github.com/cryptonative-ch/mesa-smartcontracts.git
```

Move into the mesa-contracts working directory

```sh
cd mesa-contracts/
```

Install dependencies

```sh
yarn install
```

Building the contracts

```sh
yarn build
```

## Deploying Contracts

Create a new .env file in the main directory with the following variables:

```sh
# Mnemonic, only first address will be used
MNEMONIC="xxx"

# Add Infura provider key
INFURA_KEY=""

# Optional Etherscan key, for automatize the verification of the contracts at Etherscan
ETHERSCAN_KEY=""

# Optional, if you plan to use Tenderly scripts
TENDERLY_PROJECT=""
TENDERLY_USERNAME=""
```