import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { TAGS } from "../deployment.config";
import { AquaFactory } from "../../typechain";

const deployment: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, ethers } = hre;

    const { TemplateLauncher, AquaFactory } = await deployments.all();
    const aquaFactoryInstance = await ethers.getContractAt<AquaFactory>(
        "AquaFactory",
        AquaFactory.address
    );

    const currentTemplateLauncher =
        await aquaFactoryInstance.templateLauncher();

    if (
        currentTemplateLauncher.toLowerCase() !==
        TemplateLauncher.address.toLowerCase()
    ) {
        deployments.log(`Registering Template Launcher on AquaFactory...`);
        await aquaFactoryInstance.setTemplateLauncher(TemplateLauncher.address);
        deployments.log(
            `Template Launcher (${TemplateLauncher.address}) registered on AquaFactory(${AquaFactory.address})`
        );
    }
};

deployment.tags = [TAGS.AQUA, TAGS.REGISTER_TEMPLATE_LAUNCHER];
deployment.dependencies = [TAGS.TEMPLATE_LAUNCHER];

export default deployment;
