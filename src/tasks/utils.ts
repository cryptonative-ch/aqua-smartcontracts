import { Contract } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
export async function getFairSaleContract({
    ethers,
    deployments,
}: HardhatRuntimeEnvironment): Promise<Contract> {
    const authenticatorDeployment = await deployments.get("FairSale");

    const authenticator = new Contract(
        authenticatorDeployment.address,
        authenticatorDeployment.abi
    ).connect(ethers.provider);

    return authenticator;
}
