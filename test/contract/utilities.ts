import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";

import { encodeOrder, Order } from "../../src/priceCalculation";

export async function closeAuction(instance: Contract): Promise<void> {
    const time_remaining = (
        await instance.getSecondsRemainingInBatch()
    ).toNumber();
    await increaseTime(time_remaining + 1);
    await instance.setAuctionEndDate((await getCurrentTime()) - 10);
}

export async function claimFromAllOrders(
    easyAuction: Contract,
    orders: Order[]
): Promise<void> {
    for (const order of orders) {
        await easyAuction.claimFromParticipantOrder([encodeOrder(order)]);
    }
}

export async function getCurrentTime(): Promise<number> {
    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    return block.timestamp;
}

export async function mineBlock(timestamp: number): Promise<void> {
    ethers.provider.send("evm_mine", [timestamp]);
}

export async function increaseTime(duration: number): Promise<void> {
    ethers.provider.send("evm_increaseTime", [duration]);
    ethers.provider.send("evm_mine", []);
}

export function expandTo18Decimals(n: number): BigNumber {
    return BigNumber.from(n).mul(BigNumber.from(10).pow(18));
}

export async function sendTxAndGetReturnValue<T>(
    contract: Contract,
    fnName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
): Promise<T> {
    const result = await contract.callStatic[fnName](...args);
    await contract.functions[fnName](...args);
    return result;
}
