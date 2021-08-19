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

## Publishing aqua-sc package to npm

### TLDR;
```shell
$ yarn aqua-sc:bundle
$ yarn aqua-sc:publish:dev 
```

#### 1. Make sure that all changes you want to include in package are compiled (`yarn compile`) and/or all deployments have been successful.
#### 2. Run `yarn bundle` - it will generate everything needed for package out of `build` and `deployments` folders into `aqua-sc`.
#### 3. Upgrade version in `aqua-sc/package.json`: 
- for dev prerelease increment dev prerelease version (0.0.0-dev.1 => 0.0.0-dev.2) or run 
```shell
$ cd aqua-sc
$ npm version prerelease
```
- for prod release use 
```shell
$ npm version [<newversion> | major | minor | patch]
```
#### 4. Publish new version:
- dev:
```shell
$ npm publish --tag dev
```
- prod:
```shell
$ npm publish
```