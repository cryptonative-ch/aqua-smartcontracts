import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { TAGS } from "../deployment.config";
import { runVerify } from "../utils";
import { AquaFactory__factory } from "../../typechain";
import { contractConstructorArgs } from "../../src/ts/types";
import { getDeploymentConfig } from "../deployment.config";

const deployment: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts, network } = hre;
    const { deploy } = deployments;

    const { deployer } = await getNamedAccounts();

    const config = getDeploymentConfig(network.name);

    const constructorArgs = contractConstructorArgs<AquaFactory__factory>(
        config?.feeManager || deployer,
        config?.feeTo || deployer,
        config?.templateManager || deployer,
        config?.templateFee || 0,
        config?.feeNumerator || 0,
        config?.saleFee || 0
    );

    const deployResult = await deploy("AquaFactory", {
        from: deployer,
        args: constructorArgs,
        log: true,
    });

    if (deployResult.newlyDeployed && deployResult.transactionHash) {
        await runVerify(hre, deployResult.transactionHash, {
            address: deployResult.address,
            constructorArguments: constructorArgs,
        });
    }
};

deployment.tags = [TAGS.AQUA, TAGS.AQUA_FACTORY];

export default deployment;
