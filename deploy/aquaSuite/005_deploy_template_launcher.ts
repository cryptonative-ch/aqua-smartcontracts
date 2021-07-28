import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { TAGS } from "../deployment.config";
import { runVerify } from "../utils";
import { TemplateLauncher__factory } from "../../typechain";
import { contractConstructorArgs } from "../../src/ts/types";

const deployment: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, get } = deployments;

    const { deployer } = await getNamedAccounts();

    const AquaFactory = await get("AquaFactory");
    const ParticipantListLauncher = await get("ParticipantListLauncher");

    const constructorArgs = contractConstructorArgs<TemplateLauncher__factory>(
        AquaFactory.address,
        ParticipantListLauncher.address
    )

    const deployResult = await deploy("TemplateLauncher", {
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

deployment.tags = [TAGS.AQUA, TAGS.TEMPLATE_LAUNCHER];
deployment.dependencies = [TAGS.AQUA_FACTORY, TAGS.PARTICIPANT_LIST_LAUNCHER];

export default deployment;
