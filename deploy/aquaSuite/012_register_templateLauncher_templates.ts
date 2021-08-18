import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { TAGS } from "../deployment.config";
import { TemplateLauncher } from "../../typechain";

const deployment: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, ethers } = hre;

    const { TemplateLauncher, FixedPriceSaleTemplate, FairSaleTemplate } =
        await deployments.all();
    const templateLauncherInstance =
        await ethers.getContractAt<TemplateLauncher>(
            "TemplateLauncher",
            TemplateLauncher.address
        );

    await templateLauncherInstance.addTemplate(FixedPriceSaleTemplate.address);
    deployments.log(
        `FixedPriceSaleTemplate (${FixedPriceSaleTemplate.address}) registered on TemplateLauncher (${TemplateLauncher.address})`
    );
    await templateLauncherInstance.addTemplate(FairSaleTemplate.address);
    deployments.log(
        `FairSaleTemplate (${FairSaleTemplate.address}) registered on TemplateLauncher (${TemplateLauncher.address})`
    );
};

deployment.tags = [TAGS.AQUA, TAGS.REGISTER_TEMPLATE_LAUNCHER_TEMPLATES];
deployment.dependencies = [
    TAGS.TEMPLATE_LAUNCHER,
    TAGS.FIXED_PRICE_SALE_TEMPLATE,
    TAGS.FAIR_SALE_TEMPLATE,
];

export default deployment;
