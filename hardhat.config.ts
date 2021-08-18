import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-deploy";
import "solidity-coverage";
import "hardhat-gas-reporter";
import "./tasks/launch_FairSale";
import "./tasks/launch_FixedPriceSale";
import dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/types";

dotenv.config();

export const config: HardhatUserConfig = {
    // namedAccounts are used if no config is found for given network in deploy/deployment.config.ts
    namedAccounts: {
        deployer: {
            default: 0,
        },
    },
    networks: {
        mainnet: {
            live: true,
            saveDeployments: true,
            url: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
        },
        rinkeby: {
            live: false,
            saveDeployments: true,
            url: `https://rinkeby.infura.io/v3/${process.env.INFURA_KEY}`,
            accounts: [`${process.env.PRIVATE_KEY}`],
        },
        xdai: {
            live: true,
            saveDeployments: true,
            url: "https://xdai.poanetwork.dev",
            accounts: [`${process.env.PRIVATE_KEY}`],
        },
        hardhat: {
            hardfork: process.env.CODE_COVERAGE ? "berlin" : "london"
        }
    },
    mocha: {
        timeout: "600s",
    },
    paths: {
        artifacts: "build/artifacts",
        cache: "build/cache",
        deploy: "deploy",
        sources: "contracts",
        deployments: "deployments",
    },
    solidity: {
        compilers: [
            {
                version: "0.6.12",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
        ],
    },
    gasReporter: {
        currency: "USD",
        enabled: process.env.GAS_REPORT_ENABLED === "true",
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY,
    },
    typechain: {
        outDir: "typechain",
        target: "ethers-v5",
    },
};

export default config;
