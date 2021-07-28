import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { TAGS } from "../deployment.config";
import { runVerify } from "../utils";
import { contractConstructorArgs } from "../../src/ts/types";
import { ParticipantListLauncher__factory } from "../../typechain";

const deployment: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, get } = deployments;

    const { deployer } = await getNamedAccounts();

    const AquaFactory = await get("AquaFactory");
    const ParticipantList = await get("ParticipantList");

    const constructorArgs = contractConstructorArgs<ParticipantListLauncher__factory>(
        AquaFactory.address,
        ParticipantList.address
    )

    const deployResult = await deploy("ParticipantListLauncher", {
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

deployment.tags = [TAGS.AQUA, TAGS.PARTICIPANT_LIST_LAUNCHER];
deployment.dependencies = [TAGS.AQUA_FACTORY, TAGS.PARTICIPANT_LIST];

export default deployment;
