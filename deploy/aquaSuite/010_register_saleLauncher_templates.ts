import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { TAGS } from "../deployment.config";
import { SaleLauncher } from "../../typechain";

const deployment: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, ethers } = hre;

    const { SaleLauncher, FairSale, FixedPriceSale } = await deployments.all();

    const saleLauncherInstance = await ethers.getContractAt<SaleLauncher>(
        "SaleLauncher",
        SaleLauncher.address
    );

    const isFairSaleAdded = (
        await saleLauncherInstance.getTemplateId(FairSale.address)
    ).toNumber();

    if (!isFairSaleAdded) {
        deployments.log(`Adding FairSale to SaleLauncher...`);
        await saleLauncherInstance.addTemplate(FairSale.address);
        deployments.log(
            `FairSale (${FairSale.address}) registered on SaleLauncher(${saleLauncherInstance.address})`
        );
    }

    const isFixedPriceSaleAdded = (
        await saleLauncherInstance.getTemplateId(FixedPriceSale.address)
    ).toNumber();

    if (!isFixedPriceSaleAdded) {
        deployments.log(`Adding FixedPriceSale to SaleLauncher...`);
        await saleLauncherInstance.addTemplate(FixedPriceSale.address);
        deployments.log(
            `FixedPriceSale (${FixedPriceSale.address}) registered on SaleLauncher(${saleLauncherInstance.address})`
        );
    }
};

deployment.tags = [TAGS.AQUA, TAGS.REGISTER_SALE_TEMPLATES];
deployment.dependencies = [
    TAGS.SALE_LAUNCHER,
    TAGS.FIXED_PRICE_SALE,
    TAGS.FAIR_SALE,
];

export default deployment;
