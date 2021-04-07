import { Contract, BigNumber } from "ethers";
import hre, { ethers, waffle } from "hardhat";
import { resolve } from "path";

import {
    createTokensAndMintAndApprove,
    placeOrders,
    getAllSellOrders,
    queueStartElement,
} from "../../src/priceCalculation";

import { mineBlock, closeAuction } from "./utilities";
import { parseAuctionData } from "../src/auction-data";

describe("FairSale", async () => {
    const [user_1, user_2] = waffle.provider.getWallets();
    let fairSale: Contract;
    beforeEach(async () => {
        const FairSale = await ethers.getContractFactory("FairSale");

        fairSale = await FairSale.deploy();
    });
    it("e2e - places a lot of sellOrders with diverse wallets and then  distributeAllTokens", async () => {

        const accounts = await ethers.getSigners();
        const distributPerBlock = 10;

        let wallets = new Array();

        for (const wallet of accounts) {
            wallets.push(wallet);
        }

        const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
            fairSale,
            wallets,
            hre
        );

        /// @param _tokenIn token to make the bid in
        /// @param _tokenOut token to buy
        /// @param _orderCancelationPeriodDuration cancel order is allowed, but only during this duration
        /// @param _duration amount of tokens to be sold
        /// @param _totalTokenOutAmount total amount to sell
        /// @param _minBidAmountToReceive Minimum amount of biding token to receive at final point
        /// @param _minimumBiddingAmountPerOrder to limit number of orders to reduce gas cost for settelment
        /// @param _minSellThreshold for the sale, otherwise sale will not happen
        /// @param _isAtomicClosureAllowed allow atomic closer of the sale
        await fairSale.initAuction(
            tokenIn.address,
            tokenOut.address,
            60 * 60,
            60 * 60,
            ethers.utils.parseEther("50000"),
            ethers.utils.parseEther("1"),
            1,
            0,
            false
        );

        //const auctionBidsFromCSV = await parseAuctionData(resolve(__dirname, '../data/realistic-bids.csv'));
        const auctionBidsFromCSV = await parseAuctionData(resolve(__dirname, '../data/realistic-bids-sort.csv'));


        let i = 0;

        for (let bid of auctionBidsFromCSV) { 
            console.log(bid);

            console.log(bid.orderTokenIn);
            const orderTokenIn =  ethers.utils.parseEther(bid.orderTokenIn.toString());
            console.log(orderTokenIn.toString());

            console.log(bid.orderTokenOut);
            const orderTokenOut =  ethers.utils.parseEther(bid.orderTokenOut.toString());
            console.log(orderTokenOut);

            await fairSale.connect(accounts[i]).placeOrders(
                [orderTokenOut],
                [orderTokenIn],
                [queueStartElement],
            );
            i++;
        }

        await closeAuction(fairSale);
        await fairSale.settleAuction();

        const { priceNumerator, priceDenominator } = await fairSale.getClearingPrice();
        const clearingPrice = priceDenominator/priceNumerator
        console.log("Gas clearingPrice", clearingPrice);
        
        await getAllSellOrders(fairSale);

        const tx = await fairSale.distributeAllTokens();
        
        const gasUsed = (await tx.wait()).gasUsed;

        console.log("Gas distributeAllTokens", gasUsed.toString());
    });

});
