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

    const isFSTAdded = (
        await templateLauncherInstance.getTemplateId(FairSaleTemplate.address)
    ).toNumber();
    if (!isFSTAdded) {
        deployments.log(`Registering FairSaleTemplate on TemplateLauncher...`);
        await (
            await templateLauncherInstance.addTemplate(FairSaleTemplate.address)
        ).wait(2);
        deployments.log(
            `FairSaleTemplate (${FairSaleTemplate.address}) registered on TemplateLauncher (${TemplateLauncher.address})`
        );
    }

    const isFPSTAdded = (
        await templateLauncherInstance.getTemplateId(
            FixedPriceSaleTemplate.address
        )
    ).toNumber();
    if (!isFPSTAdded) {
        deployments.log(
            `Registering FixedPriceSaleTemplate on TemplateLauncher...`
        );
        await (
            await templateLauncherInstance.addTemplate(
                FixedPriceSaleTemplate.address
            )
        ).wait(2);
        deployments.log(
            `FixedPriceSaleTemplate (${FixedPriceSaleTemplate.address}) registered on TemplateLauncher (${TemplateLauncher.address})`
        );
    }
};

deployment.tags = [TAGS.AQUA, TAGS.REGISTER_TEMPLATE_LAUNCHER_TEMPLATES];
deployment.dependencies = [
    TAGS.TEMPLATE_LAUNCHER,
    TAGS.FIXED_PRICE_SALE_TEMPLATE,
    TAGS.FAIR_SALE_TEMPLATE,
];

export default deployment;
