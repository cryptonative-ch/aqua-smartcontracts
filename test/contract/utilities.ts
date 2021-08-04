import { ethers } from "hardhat";
import { BigNumber, BigNumberish, Contract } from "ethers";

import { FairSale } from "../../typechain";
import { encodeOrder, Order } from "../../src/priceCalculation";

export async function closeAuction(instance: Contract): Promise<void> {
    const time_remaining = (
        await instance.getSecondsRemainingInBatch()
    ).toNumber();
    await increaseTime(time_remaining + 1);
}

export async function claimFromAllOrders(
    fairSale: FairSale,
    orders: Order[]
): Promise<void> {
    for (const order of orders) {
        await fairSale.claimFromParticipantOrder([encodeOrder(order)]);
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
    ...args: any[]
): Promise<T> {
    const result = await contract.callStatic[fnName](...args);
    await contract.functions[fnName](...args);
    return result;
}

export const encodeFairSaleInitData = (
    tokenIn: string,
    tokenOut: string,
    orderCancelationPeriodDuration: BigNumberish,
    duration: BigNumberish,
    totalTokenOutAmount: BigNumberish,
    minBidAmountToReceive: BigNumberish,
    minimumBiddingAmountPerOrder: BigNumberish,
    minSellThreshold: BigNumberish,
    isAtomicClosureAllowed: boolean
) => {
    return ethers.utils.defaultAbiCoder.encode(
        [
            "address",
            "address",
            "uint256",
            "uint256",
            "uint96",
            "uint96",
            "uint256",
            "uint256",
            "bool",
        ],
        [
            tokenIn,
            tokenOut,
            orderCancelationPeriodDuration,
            duration,
            totalTokenOutAmount,
            minBidAmountToReceive,
            minimumBiddingAmountPerOrder,
            minSellThreshold,
            isAtomicClosureAllowed,
        ]
    );
};

export const encodeFixedPriceSaleInitData = (
    tokenIn: string,
    tokenOut: string,
    tokenPrice: BigNumber,
    tokensForSale: BigNumber,
    startDate: number,
    endDate: number,
    minCommitment: BigNumber,
    maxCommitment: BigNumber,
    minRaise: BigNumber,
    owner: string,
    partipantList: string
) => {
    return ethers.utils.defaultAbiCoder.encode(
        [
            "address",
            "address",
            "uint256",
            "uint256",
            "uint256",
            "uint256",
            "uint256",
            "uint256",
            "uint256",
            "address",
            "address",
        ],
        [
            tokenIn,
            tokenOut,
            tokenPrice,
            tokensForSale,
            startDate,
            endDate,
            minCommitment,
            maxCommitment,
            minRaise,
            owner,
            partipantList,
        ]
    );
};
