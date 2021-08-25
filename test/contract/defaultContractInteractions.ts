import { ethers } from "hardhat";

import { FairSale } from "../../typechain";
import { encodeFairSaleInitData } from "./utilities";
import { InitiateAuctionInput } from "../../src/ts/types";

type PartialAuctionInput = Partial<InitiateAuctionInput> &
    Pick<InitiateAuctionInput, "tokenOut" | "tokenIn" | "owner">;

async function createAuctionInputWithDefaults(
    parameters: PartialAuctionInput
): Promise<Parameters<typeof encodeFairSaleInitData>> {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    return [
        parameters.tokenIn.address,
        parameters.tokenOut.address,
        parameters.orderCancellationEndDate ?? now + 3600,
        parameters.auctionStartDate ?? now + 500,
        parameters.auctionEndDate ?? now + 3600,
        parameters.auctionedSellAmount ?? ethers.utils.parseEther("1"),
        parameters.minBuyAmount ?? ethers.utils.parseEther("1"),
        parameters.minimumBiddingAmountPerOrder ?? 1,
        parameters.minFundingThreshold ?? 0,
        parameters.isAtomicClosureAllowed ?? false,
        parameters.owner,
    ];
}

export async function createAuctionWithDefaults(
    fairSale: FairSale,
    parameters: Partial<InitiateAuctionInput> &
        Pick<InitiateAuctionInput, "tokenOut" | "tokenIn">
) {
    if (
        !parameters.owner ||
        parameters.owner === ethers.constants.AddressZero
    ) {
        const owner = await fairSale.signer.getAddress();
        parameters.owner = owner;
    }
    const defaultValues = await createAuctionInputWithDefaults(
        parameters as PartialAuctionInput
    );
    const params = encodeFairSaleInitData(...defaultValues);

    return fairSale.init(params);
}
