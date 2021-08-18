import { BigNumberish, Contract, ContractFactory } from "ethers";

export interface InitiateAuctionInput {
    tokenOut: Contract;
    tokenIn: Contract;
    orderCancellationEndDate: BigNumberish;
    auctionStartDate: BigNumberish;
    auctionEndDate: BigNumberish;
    auctionedSellAmount: BigNumberish;
    minBuyAmount: BigNumberish;
    minimumBiddingAmountPerOrder: BigNumberish;
    minFundingThreshold: BigNumberish;
    isAtomicClosureAllowed: boolean;
}

export const contractConstructorArgs = <T extends ContractFactory>(
    ...args: Parameters<T["deploy"]>
) => args;
