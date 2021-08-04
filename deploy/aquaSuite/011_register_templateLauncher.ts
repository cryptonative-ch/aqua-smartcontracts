import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { TAGS } from "../deployment.config";
import { AquaFactory } from "../../typechain";

const deployment: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, ethers } = hre;

    const { TemplateLauncher, AquaFactory } = await deployments.all();
    const aquaFactoryInstance =
        await ethers.getContractAt<AquaFactory>(
            "AquaFactory",
            AquaFactory.address
        );

    await aquaFactoryInstance.setTemplateLauncher(TemplateLauncher.address)
};

deployment.tags = [TAGS.AQUA];
deployment.dependencies = [TAGS.TEMPLATE_LAUNCHER];

export default deployment;
