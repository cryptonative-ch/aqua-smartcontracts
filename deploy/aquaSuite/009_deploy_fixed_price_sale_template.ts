import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { TAGS } from "../deployment.config";
import { runVerify } from "../utils";

const deployment: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;

    const { deployer } = await getNamedAccounts();

    const deployResult = await deploy("FixedPriceSaleTemplate", {
        from: deployer,
        log: true,
    });

    if (deployResult.newlyDeployed && deployResult.transactionHash) {
        await runVerify(hre, deployResult.transactionHash, {
            address: deployResult.address,
        });
    }
};

deployment.tags = [TAGS.AQUA, TAGS.FIXED_PRICE_SALE_TEMPLATE];

export default deployment;
