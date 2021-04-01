import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import hre, { ethers, waffle } from "hardhat";

import { mineBlock, expandTo18Decimals } from "./utilities";
import "@nomiclabs/hardhat-ethers";


import {
    createTokensAndMintAndApprove,
} from "../../src/priceCalculation";


describe("FixedPriceAuctionE2E", async () => {
    const [user_1, user_2] = waffle.provider.getWallets();

    let fixedPriceAuction: Contract;
    let auctionIntialized: Contract;
    let tokenIn: Contract;
    let tokenOut: Contract;
    let currentBlockNumber, currentBlock;

    const defaultTokenPrice = expandTo18Decimals(10);
    const defaultTokensForSale = expandTo18Decimals(2000);
    const defaultAllocationMin = expandTo18Decimals(2);
    const defaultAllocationMax = expandTo18Decimals(10);
    const defaultMinimumRaise = expandTo18Decimals(5000);
    let defaultStartDate: number;
    let defaultEndDate: number;

    function encodeInitData(
        tokenIn: string,
        tokenOut: string,
        tokenPrice: BigNumber,
        tokensForSale: BigNumber,
        startDate: number,
        endDate: number,
        allocationMin: BigNumber,
        allocationMax: BigNumber,
        minimumRaise: BigNumber,
        owner: string
    ) {
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
            ],
            [
                tokenIn,
                tokenOut,
                tokenPrice,
                tokensForSale,
                startDate,
                endDate,
                allocationMin,
                allocationMax,
                minimumRaise,
                owner,
            ]
        );
    }

    beforeEach(async () => {

        const FixedPriceAuction = await ethers.getContractFactory(
            "FixedPriceAuction"
        );

        const ERC20 = await hre.ethers.getContractFactory("ERC20Mintable");

        fixedPriceAuction = await FixedPriceAuction.deploy();
        auctionIntialized = await FixedPriceAuction.deploy();

        tokenIn = await ERC20.deploy("tokenIn", "tokA");
        tokenOut = await ERC20.deploy("tokenOut", "tokB");

        const accounts = await ethers.getSigners();

        for (const wallet of accounts) {
            await tokenIn.mint(wallet.address, BigNumber.from(10).pow(30));
            await tokenOut.mint(wallet.address, BigNumber.from(10).pow(30));

            await tokenIn.connect(wallet).approve(fixedPriceAuction.address, BigNumber.from(10).pow(30));
            await tokenOut.connect(wallet).approve(fixedPriceAuction.address, BigNumber.from(10).pow(30));

            await tokenIn.connect(wallet).approve(auctionIntialized.address, BigNumber.from(10).pow(30));
            await tokenOut.connect(wallet).approve(auctionIntialized.address, BigNumber.from(10).pow(30));
            //console.log(wallet.address);
        } 

        currentBlockNumber = await ethers.provider.getBlockNumber();
        currentBlock = await ethers.provider.getBlock(currentBlockNumber);
        defaultStartDate = currentBlock.timestamp + 500;
        defaultEndDate = defaultStartDate + 86400; // 24 hours

        const initData = await encodeInitData(
            tokenIn.address,
            tokenOut.address,
            defaultTokenPrice,
            defaultTokensForSale,
            defaultStartDate,
            defaultEndDate,
            defaultAllocationMin,
            defaultAllocationMax,
            defaultMinimumRaise,
            user_1.address
        );
        await auctionIntialized.init(initData);
    });
    describe("allow distributeAllTokens ", async () => {
        it("allows distributeAllTokens with 128 accounts", async () => {
            const initData = await encodeInitData(
                tokenIn.address,
                tokenOut.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultAllocationMin,
                defaultAllocationMax,
                expandTo18Decimals(0),
                user_1.address
            );

            await fixedPriceAuction.init(initData);
            let ordersCount = 128;

            const distributPerBlock = 100;
            // console.log("distributPerBlock", distributPerBlock);
            
            const accounts = await ethers.getSigners();
            let i = 1;
            for (let wallet of accounts) { 
                await fixedPriceAuction.connect(wallet).buyTokens(expandTo18Decimals(3));
                if (i == ordersCount) {
                    break;
                }
                i++;
            }

            await mineBlock(defaultEndDate + 10000);
            await fixedPriceAuction.closeAuction();

            while (true) {
                ordersCount = ordersCount - distributPerBlock;

                //console.log("ordersCount", ordersCount);

                if (ordersCount < 0) {
                    await expect(fixedPriceAuction.distributeAllTokens())
                        .to.emit(fixedPriceAuction, "distributeAllTokensLeft")
                        .withArgs(0);

                    expect(await fixedPriceAuction.ordersCount()).to.be.equal(
                        0
                    );
                    break;
                }
                
                await expect(fixedPriceAuction.distributeAllTokens())
                    .to.emit(fixedPriceAuction, "distributeAllTokensLeft")
                    .withArgs(ordersCount);

                expect(await fixedPriceAuction.ordersCount()).to.be.equal(
                    ordersCount
                );
            }
        });

        it("Measure Gas Usage", async () => {
            
            const initData = await encodeInitData(
                tokenIn.address,
                tokenOut.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultAllocationMin,
                defaultAllocationMax,
                expandTo18Decimals(0),
                user_1.address
            );

            await fixedPriceAuction.init(initData);
            let ordersCount = 128;
            const distributPerBlock = 100;

            const accounts = await ethers.getSigners();
            let i = 1;
            for (let wallet of accounts) { 
                await fixedPriceAuction.connect(wallet).buyTokens(expandTo18Decimals(3));
                if (i == ordersCount) {
                    break;
                }
                i++;
            }

            await mineBlock(defaultEndDate + 10000);
            await fixedPriceAuction.closeAuction();

             while (true) {
                ordersCount = ordersCount - distributPerBlock;
                console.log("ordersCount", ordersCount);

                if (ordersCount < 0) {
                    const tx = await fixedPriceAuction.distributeAllTokens();
                    const gasUsed = (await tx.wait()).gasUsed;
                    console.log("Gas u1sage for distributeAllTokens", gasUsed.toString());
                    break;
                }
                const tx = await fixedPriceAuction.distributeAllTokens();
                const gasUsed = (await tx.wait()).gasUsed;
                console.log("Gas usage for distributeAllTokens", gasUsed.toString());
            }
        }); // it
    });
});