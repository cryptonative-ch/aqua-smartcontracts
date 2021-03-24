import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import hre, { ethers, waffle } from "hardhat";
import "@nomiclabs/hardhat-ethers";

import { mineBlock, expandTo18Decimals } from "./utilities";

describe("AuctionLauncher", async () => {
    const [templateManager, user_2] = waffle.provider.getWallets();
    let auctionLauncher: Contract;
    let mesaFactory: Contract;
    let templateLauncher: Contract;
    let weth: Contract;
    let easyAuctionTemplate: Contract;
    let easyAuctionTemplateDefault: Contract;
    let tokenA: Contract;
    let tokenB: Contract;
    let defaultTemplate: String;
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
        currentBlockNumber = await ethers.provider.getBlockNumber();
        currentBlock = await ethers.provider.getBlock(currentBlockNumber);

        defaultStartDate = currentBlock.timestamp + 500;
        defaultEndDate = defaultStartDate + 86400; // 24 hours

        const MesaFactory = await ethers.getContractFactory("MesaFactory");

        mesaFactory = await MesaFactory.deploy();

        const TemplateLauncher = await ethers.getContractFactory(
            "TemplateLauncher"
        );

        templateLauncher = await TemplateLauncher.deploy(mesaFactory.address);

        await mesaFactory.initalize(
            templateManager.address,
            templateManager.address,
            templateManager.address,
            templateLauncher.address,
            0,
            0,
            0
        );

        const AuctionLauncher = await ethers.getContractFactory(
            "AuctionLauncher"
        );

        auctionLauncher = await AuctionLauncher.deploy(mesaFactory.address);

        const WETH = await ethers.getContractFactory("WETH10");

        weth = await WETH.deploy();

        const ERC20 = await hre.ethers.getContractFactory("ERC20Mintable");
        tokenA = await ERC20.deploy("tokenA", "tokA");
        await tokenA.mint(templateManager.address, BigNumber.from(10).pow(30));
        tokenB = await ERC20.deploy("tokenB", "tokB");

        const EasyAuctionTemplate = await ethers.getContractFactory(
            "EasyAuctionTemplate"
        );

        easyAuctionTemplate = await EasyAuctionTemplate.deploy(
            weth.address,
            auctionLauncher.address,
            1
        );

        easyAuctionTemplateDefault = await EasyAuctionTemplate.deploy(
            weth.address,
            auctionLauncher.address,
            1
        );

        defaultTemplate = await auctionLauncher.addTemplate(
            easyAuctionTemplateDefault.address
        );
    });
    describe("adding templates", async () => {
        it("throws if template added by non-admin", async () => {
            await expect(
                auctionLauncher
                    .connect(user_2)
                    .addTemplate(easyAuctionTemplate.address)
            ).to.be.revertedWith("AuctionCreator: FORBIDDEN");
        });

        it("throws if template is added twice", async () => {
            await auctionLauncher.addTemplate(easyAuctionTemplate.address);
            await expect(
                auctionLauncher.addTemplate(easyAuctionTemplate.address)
            ).to.be.revertedWith("AuctionCreator: TEMPLATE_DUPLICATE");
        });

        it("allows template manager to add new templates", async () => {
            expect(
                await auctionLauncher.getTemplateId(easyAuctionTemplate.address)
            ).to.be.equal(0);

            await expect(
                auctionLauncher.addTemplate(easyAuctionTemplate.address)
            )
                .to.emit(auctionLauncher, "TemplateAdded")
                .withArgs(easyAuctionTemplate.address, 2);

            expect(
                await auctionLauncher.getTemplateId(easyAuctionTemplate.address)
            ).to.be.equal(2);

            expect(await auctionLauncher.getTemplate(2)).to.be.equal(
                easyAuctionTemplate.address
            );

            expect(
                await auctionLauncher.getDepositAmountWithFees(10000)
            ).to.be.equal(10000);
        });
    });

    describe("removing templates", async () => {
        it("throws if template removed by non-admin", async () => {
            await expect(
                auctionLauncher.connect(user_2).removeTemplate(1)
            ).to.be.revertedWith("AuctionCreator: FORBIDDEN");
        });

        it("allows template manager to remove templates", async () => {
            await auctionLauncher.addTemplate(easyAuctionTemplate.address);
            await expect(auctionLauncher.removeTemplate(2))
                .to.emit(auctionLauncher, "TemplateRemoved")
                .withArgs(easyAuctionTemplate.address, 2);
        });
    });

    describe("launching auctions", async () => {
        it("throws if trying to launch invalid templateId", async () => {
            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultAllocationMin,
                defaultAllocationMax,
                defaultMinimumRaise,
                templateManager.address
            );

            await expect(
                auctionLauncher.createAuction(
                    3,
                    tokenA.address,
                    10000,
                    initData
                )
            ).to.be.revertedWith("AuctionCreator: INVALID_TEMPLATE");
        });

        it("throws if trying to launch auction without providing auction fee", async () => {
            await mesaFactory.setAuctionFee(500);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultAllocationMin,
                defaultAllocationMax,
                defaultMinimumRaise,
                templateManager.address
            );

            await expect(
                auctionLauncher.createAuction(
                    1,
                    tokenA.address,
                    10000,
                    initData
                )
            ).to.be.revertedWith("AuctionCreator: AUCTION_FEE_NOT_PROVIDED");
        });

        it("allows to create new auctions", async () => {
            await mesaFactory.setAuctionFee(500);

            expect(await auctionLauncher.numberOfAuctions()).to.be.equal(0);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultAllocationMin,
                defaultAllocationMax,
                defaultMinimumRaise,
                templateManager.address
            );

            await tokenA.approve(auctionLauncher.address, 10000);

            await auctionLauncher.createAuction(
                1,
                tokenA.address,
                10000,
                initData,
                {
                    value: 500,
                }
            );

            expect(await auctionLauncher.numberOfAuctions()).to.be.equal(1);
        });
    });
});
