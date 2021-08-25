import { expect } from "chai";
import { BigNumber } from "ethers";
import hre, { ethers, waffle } from "hardhat";
import "@nomiclabs/hardhat-ethers";

import { expandTo18Decimals } from "./utilities";
import {
    AquaFactory,
    SaleLauncher,
    ERC20Mintable,
    ParticipantList,
    FairSaleTemplate,
    TemplateLauncher,
    ParticipantListLauncher,
    AquaFactory__factory,
    SaleLauncher__factory,
    ERC20Mintable__factory,
    ParticipantList__factory,
    FairSaleTemplate__factory,
    TemplateLauncher__factory,
    ParticipantListLauncher__factory,
} from "../../typechain";

describe("SaleLauncher", async () => {
    const [templateManager, user_2] = waffle.provider.getWallets();
    let saleLauncher: SaleLauncher;
    let aquaFactory: AquaFactory;
    let templateLauncher: TemplateLauncher;
    let fairSaleTemplate: FairSaleTemplate;
    let fairSaleTemplateDefault: FairSaleTemplate;
    let participantListTemplate: ParticipantList;
    let participantListLauncher: ParticipantListLauncher;
    let tokenA: ERC20Mintable;
    let tokenB: ERC20Mintable;
    let currentBlockNumber, currentBlock;

    const defaultTokensForSale = expandTo18Decimals(2000);
    const defaultMinRaise = expandTo18Decimals(5000);
    const defaultMinPrice = expandTo18Decimals(1);
    const defaultMinBuyAmount = expandTo18Decimals(1);
    const defaultMinimumBiddingAmountPerOrder = expandTo18Decimals(10);

    let defaultOrderCancelationPeriodDuration: number;
    let defaultStartDate: number;
    let defaultDuration: number;

    function encodeInitDataFairSale(
        saleLauncher: string,
        saleTemplateId: number,
        tokenIn: string,
        tokenOut: string,
        duration: number,
        tokensForSale: BigNumber,
        minPrice: BigNumber,
        minBuyAmount: BigNumber,
        minRaise: BigNumber,
        orderCancelationPeriodDuration: number,
        minimumBiddingAmountPerOrder: BigNumber,
        tokenSupplier: string
    ) {
        return ethers.utils.defaultAbiCoder.encode(
            [
                "address",
                "uint256",
                "address",
                "address",
                "uint256",
                "uint256",
                "uint96",
                "uint96",
                "uint256",
                "uint256",
                "uint256",
                "address",
            ],
            [
                saleLauncher,
                saleTemplateId,
                tokenIn,
                tokenOut,
                duration,
                tokensForSale,
                minPrice,
                minBuyAmount,
                minRaise,
                orderCancelationPeriodDuration,
                minimumBiddingAmountPerOrder,
                tokenSupplier,
            ]
        );
    }

    beforeEach(async () => {
        currentBlockNumber = await ethers.provider.getBlockNumber();
        currentBlock = await ethers.provider.getBlock(currentBlockNumber);
        defaultStartDate = currentBlock.timestamp + 500;
        defaultDuration = defaultStartDate + 86400;
        defaultOrderCancelationPeriodDuration = currentBlock.timestamp + 3600;

        const AquaFactory =
            await ethers.getContractFactory<AquaFactory__factory>(
                "AquaFactory"
            );

        aquaFactory = await AquaFactory.deploy(
            templateManager.address,
            templateManager.address,
            templateManager.address,
            0,
            0,
            0
        );

        const ParticipantListTemplate =
            await ethers.getContractFactory<ParticipantList__factory>(
                "ParticipantList"
            );
        participantListTemplate = await ParticipantListTemplate.deploy();

        const ParticipantListLauncher =
            await ethers.getContractFactory<ParticipantListLauncher__factory>(
                "ParticipantListLauncher"
            );
        participantListLauncher = await ParticipantListLauncher.deploy(
            aquaFactory.address,
            participantListTemplate.address
        );

        const TemplateLauncher =
            await ethers.getContractFactory<TemplateLauncher__factory>(
                "TemplateLauncher"
            );

        templateLauncher = await TemplateLauncher.deploy(
            aquaFactory.address,
            participantListLauncher.address
        );

        await aquaFactory.setTemplateLauncher(templateLauncher.address);

        const SaleLauncher =
            await ethers.getContractFactory<SaleLauncher__factory>(
                "SaleLauncher"
            );

        saleLauncher = await SaleLauncher.deploy(aquaFactory.address);

        const ERC20 =
            await hre.ethers.getContractFactory<ERC20Mintable__factory>(
                "ERC20Mintable"
            );
        tokenA = await ERC20.deploy("tokenA", "tokA");
        await tokenA.mint(templateManager.address, BigNumber.from(10).pow(30));
        tokenB = await ERC20.deploy("tokenB", "tokB");

        const FairSaleTemplate =
            await ethers.getContractFactory<FairSaleTemplate__factory>(
                "FairSaleTemplate"
            );

        fairSaleTemplate = await FairSaleTemplate.deploy();

        fairSaleTemplateDefault = await FairSaleTemplate.deploy();

        await saleLauncher.addTemplate(fairSaleTemplateDefault.address);
    });
    describe("adding templates", async () => {
        it("throws if template added by non-admin", async () => {
            await expect(
                saleLauncher
                    .connect(user_2)
                    .addTemplate(fairSaleTemplate.address)
            ).to.be.revertedWith("SaleLauncher: FORBIDDEN");
        });

        it("throws if template is added twice", async () => {
            await saleLauncher.addTemplate(fairSaleTemplate.address);
            await expect(
                saleLauncher.addTemplate(fairSaleTemplate.address)
            ).to.be.revertedWith("SaleLauncher: TEMPLATE_DUPLICATE");
        });

        it("allows template manager to add new templates", async () => {
            expect(
                await saleLauncher.getTemplateId(fairSaleTemplate.address)
            ).to.be.equal(0);

            await expect(saleLauncher.addTemplate(fairSaleTemplate.address))
                .to.emit(saleLauncher, "TemplateAdded")
                .withArgs(fairSaleTemplate.address, 2);

            expect(
                await saleLauncher.getTemplateId(fairSaleTemplate.address)
            ).to.be.equal(2);

            expect(await saleLauncher.getTemplate(2)).to.be.equal(
                fairSaleTemplate.address
            );

            expect(
                await saleLauncher.getDepositAmountWithFees(10000)
            ).to.be.equal(10000);
        });
    });

    describe("removing templates", async () => {
        it("throws if template removed by non-admin", async () => {
            await expect(
                saleLauncher.connect(user_2).removeTemplate(1)
            ).to.be.revertedWith("SaleLauncher: FORBIDDEN");
        });

        it("allows template manager to remove templates", async () => {
            await saleLauncher.addTemplate(fairSaleTemplate.address);
            await expect(saleLauncher.removeTemplate(2))
                .to.emit(saleLauncher, "TemplateRemoved")
                .withArgs(fairSaleTemplate.address, 2);
        });
    });

    describe("launching sales", async () => {
        it("throws if trying to launch invalid templateId", async () => {
            const initData = encodeInitDataFairSale(
                saleLauncher.address,
            1,
            tokenA.address,
            tokenB.address,
            defaultDuration,
            defaultTokensForSale,
            defaultMinPrice,
            defaultMinBuyAmount,
            defaultMinRaise,
            defaultOrderCancelationPeriodDuration,
            defaultMinimumBiddingAmountPerOrder,
            templateManager.address
            );

            await expect(
                saleLauncher.createSale(
                    3,
                    tokenA.address,
                    10000,
                    templateManager.address,
                    initData
                )
            ).to.be.revertedWith("SaleLauncher: INVALID_TEMPLATE");
        });

        it("throws if trying to launch sales without providing sales fee", async () => {
            await aquaFactory.setSaleFee(500);

            const initData = encodeInitDataFairSale(
                saleLauncher.address,
                1,
                tokenA.address,
                tokenB.address,
                defaultDuration,
                defaultTokensForSale,
                defaultMinPrice,
                defaultMinBuyAmount,
                defaultMinRaise,
                defaultOrderCancelationPeriodDuration,
                defaultMinimumBiddingAmountPerOrder,
                templateManager.address
            );

            await expect(
                saleLauncher.createSale(
                    1,
                    tokenA.address,
                    10000,
                    templateManager.address,
                    initData
                )
            ).to.be.revertedWith("SaleLauncher: SALE_FEE_NOT_PROVIDED");
        });

        it("allows to create new sales", async () => {
            await aquaFactory.setSaleFee(500);

            expect(await saleLauncher.numberOfSales()).to.be.equal(0);

            const initData = encodeInitDataFairSale(
                saleLauncher.address,
            1,
            tokenA.address,
            tokenB.address,
            defaultDuration,
            defaultTokensForSale,
            defaultMinPrice,
            defaultMinBuyAmount,
            defaultMinRaise,
            defaultOrderCancelationPeriodDuration,
            defaultMinimumBiddingAmountPerOrder,
            templateManager.address
            );

            await tokenA.approve(saleLauncher.address, 10000);

            await saleLauncher.createSale(
                1,
                tokenA.address,
                10000,
                templateManager.address,
                initData,
                {
                    value: 500,
                }
            );

            expect(await saleLauncher.numberOfSales()).to.be.equal(1);
        });
    });
});
