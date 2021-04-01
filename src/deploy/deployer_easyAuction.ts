import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { contractNames } from "../ts/deploy";

const deployEasyContract: DeployFunction = async function (
    hre: HardhatRuntimeEnvironment
) {
    const { deployments, getNamedAccounts } = hre;
    const { deployer } = await getNamedAccounts();
    const { deploy } = deployments;

    const { fairSale } = contractNames;

    await deploy(fairSale, {
        from: deployer,
        gasLimit: 8000000,
        args: [],
        log: true,
        deterministicDeployment: false,
    });
};

export default deployEasyContract;
