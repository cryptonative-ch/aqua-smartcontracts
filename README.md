# Aqua Contracts

## Getting started
To run the tests, follow these steps. You must have at least node v10 and [yarn](https://yarnpkg.com/) installed.

First clone the repository:

```sh
git clone https://github.com/cryptonative-ch/aqua-smartcontracts.git
```

Move into the aqua-contracts working directory

```sh
cd aqua-contracts/
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
INFURA_KEY="xxx"
PRIVATE_KEY="xxx"
ETHERSCAN_API_KEY="xxx"
```