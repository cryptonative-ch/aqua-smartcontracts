import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { TAGS } from "../deployment.config";
import { runVerify } from "../utils";
import { SaleLauncher__factory } from "../../typechain";
import { contractConstructorArgs } from "../../src/ts/types";

const deployment: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, get } = deployments;

    const { deployer } = await getNamedAccounts();
    const AquaFactory = await get("AquaFactory");

    const constructorArgs = contractConstructorArgs<SaleLauncher__factory>(
        AquaFactory.address
    )

    const deployResult = await deploy("SaleLauncher", {
        from: deployer,
        args: constructorArgs,
        log: true
    });

    if (deployResult.newlyDeployed && deployResult.transactionHash) {
        await runVerify(hre, deployResult.transactionHash, {
            address: deployResult.address,
            constructorArguments: constructorArgs
        });
    }
};

deployment.tags = [TAGS.AQUA, TAGS.SALE_LAUNCHER];
deployment.dependencies = [TAGS.AQUA_FACTORY];

export default deployment;
