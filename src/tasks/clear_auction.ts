import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers";
import { task } from "hardhat/config";

import { calculateClearingPrice } from "../priceCalculation";

import { getEasyAuctionContract } from "./utils";

const clearAuction: () => void = () => {
    task("clearAuction", "Provides the clearing price to an auction")
        .addParam("auctionId", "Id of the auction to be cleared")
        .setAction(async (taskArgs, hardhatRuntime) => {
            const [caller] = await hardhatRuntime.ethers.getSigners();
            console.log("Using the account:", caller.address);
            const easyAuction = await getEasyAuctionContract(hardhatRuntime);
            //Todo: Compare current time against auction end time and throw error
            const price = await calculateClearingPrice(easyAuction);
            console.log("Clearing price will be:", price);
            const tx = await easyAuction
                .connect(caller)
                .settleAuction(taskArgs.auctionId);
            const txResult = await tx.wait();
            console.log(txResult);
        });
};

export { clearAuction };

// Rinkeby tests task
// yarn hardhat initiateAuction --auction-id 1 --network rinkeby
