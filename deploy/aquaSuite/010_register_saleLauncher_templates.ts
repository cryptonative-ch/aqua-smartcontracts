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

    await saleLauncherInstance.addTemplate(FairSale.address);
    await saleLauncherInstance.addTemplate(FixedPriceSale.address);
};

deployment.tags = [TAGS.AQUA];
deployment.dependencies = [
    TAGS.SALE_LAUNCHER,
    TAGS.FIXED_PRICE_SALE,
    TAGS.FAIR_SALE,
];

export default deployment;
