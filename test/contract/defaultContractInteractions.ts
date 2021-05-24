import { Contract, BigNumber } from "ethers";
import { ethers } from "hardhat";

import { InitiateAuctionInput } from "../../src/ts/types";

import { sendTxAndGetReturnValue } from "./utilities";

type PartialAuctionInput = Partial<InitiateAuctionInput> &
    Pick<InitiateAuctionInput, "tokenOut" | "tokenIn">;

async function createAuctionInputWithDefaults(
    parameters: PartialAuctionInput
): Promise<unknown[]> {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    return [
        parameters.tokenIn.address,
        parameters.tokenOut.address,
        parameters.orderCancellationEndDate ?? now + 3600,
        parameters.auctionEndDate ?? now + 3600,
        parameters.auctionedSellAmount ?? ethers.utils.parseEther("1"),
        parameters.minBuyAmount ?? ethers.utils.parseEther("1"),
        parameters.minimumBiddingAmountPerOrder ?? 1,
        parameters.minFundingThreshold ?? 0,
        parameters.isAtomicClosureAllowed ?? false,
    ];
}

export async function createAuctionWithDefaults(
    fairSale: Contract,
    parameters: PartialAuctionInput
): Promise<unknown> {
    return fairSale.initAuction(
        ...(await createAuctionInputWithDefaults(parameters))
    );
}
