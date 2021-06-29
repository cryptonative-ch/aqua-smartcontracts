import "@nomiclabs/hardhat-waffle";
require("@nomiclabs/hardhat-truffle5");
require("solidity-coverage");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-gas-reporter");
require("./tasks/deploy");
require("./tasks/launch_FairSale");
require("./tasks/launch_FixedPriceSale");
require("dotenv").config();

module.exports = {
    networks: {
        mainnet: {
            url: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
        },
        rinkeby: {
            url: `https://rinkeby.infura.io/v3/${process.env.INFURA_KEY}`,
            accounts: [process.env.PRIVATE_KEY],
        },
        xdai: {
            url: "https://xdai.poanetwork.dev",
            accounts: [process.env.PRIVATE_KEY],
        },
        hardhat: {},
    },
    mocha: {
        timeout: "600s",
    },
    paths: {
        artifacts: "build/artifacts",
        cache: "build/cache",
        deploy: "src/deploy",
        sources: "contracts",
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
};
