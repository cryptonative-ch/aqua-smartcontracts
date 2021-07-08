import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import hre, { ethers, waffle } from "hardhat";
import "@nomiclabs/hardhat-ethers";

import { expandTo18Decimals } from "./utilities";

describe("SaleLauncher", async () => {
    const [templateManager, user_2] = waffle.provider.getWallets();
    let saleLauncher: Contract;
    let aquaFactory: Contract;
    let templateLauncher: Contract;
    let fairSaleTemplate: Contract;
    let fairSaleTemplateDefault: Contract;
    let participantListTemplate: Contract;
    let participantListLauncher: Contract;
    let tokenA: Contract;
    let tokenB: Contract;
    let defaultTemplate: String;
    let currentBlockNumber, currentBlock;

    const defaultTokenPrice = expandTo18Decimals(10);
    const defaultTokensForSale = expandTo18Decimals(2000);
    const defaultMinCommitment = expandTo18Decimals(2);
    const defaultMaxCommitment = expandTo18Decimals(10);
    const defaultMinRaise = expandTo18Decimals(5000);
    let defaultStartDate: number;
    let defaultEndDate: number;

    function encodeInitDataFixedPrice(
        saleLauncher: string,
        saleTemplateId: number,
        tokenIn: string,
        tokenOut: string,
        tokenPrice: BigNumber,
        tokensForSale: BigNumber,
        startDate: number,
        endDate: number,
        minCommitment: BigNumber,
        maxCommitment: BigNumber,
        minRaise: BigNumber,
        owner: string
    ) {
        return ethers.utils.defaultAbiCoder.encode(
            [
                "address",
                "uint256",
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
                saleLauncher,
                saleTemplateId,
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
            ]
        );
    }

    beforeEach(async () => {
        currentBlockNumber = await ethers.provider.getBlockNumber();
        currentBlock = await ethers.provider.getBlock(currentBlockNumber);

        defaultStartDate = currentBlock.timestamp + 500;
        defaultEndDate = defaultStartDate + 86400; // 24 hours

        const AquaFactory = await ethers.getContractFactory("AquaFactory");

        aquaFactory = await AquaFactory.deploy(
            templateManager.address,
            templateManager.address,
            templateManager.address,
            0,
            0,
            0
        );

        const ParticipantListTemplate = await ethers.getContractFactory(
            "ParticipantList"
        );
        participantListTemplate = await ParticipantListTemplate.deploy();

        const ParticipantListLauncher = await ethers.getContractFactory(
            "ParticipantListLauncher"
        );
        participantListLauncher = await ParticipantListLauncher.deploy(
            aquaFactory.address,
            participantListTemplate.address
        );

        const TemplateLauncher = await ethers.getContractFactory(
            "TemplateLauncher"
        );

        templateLauncher = await TemplateLauncher.deploy(
            aquaFactory.address,
            participantListLauncher.address
        );

        await aquaFactory.setTemplateLauncher(templateLauncher.address);

        const SaleLauncher = await ethers.getContractFactory("SaleLauncher");

        saleLauncher = await SaleLauncher.deploy(aquaFactory.address);

        const ERC20 = await hre.ethers.getContractFactory("ERC20Mintable");
        tokenA = await ERC20.deploy("tokenA", "tokA");
        await tokenA.mint(templateManager.address, BigNumber.from(10).pow(30));
        tokenB = await ERC20.deploy("tokenB", "tokB");

        const FairSaleTemplate = await ethers.getContractFactory(
            "FairSaleTemplate"
        );

        fairSaleTemplate = await FairSaleTemplate.deploy();

        fairSaleTemplateDefault = await FairSaleTemplate.deploy();

        defaultTemplate = await saleLauncher.addTemplate(
            fairSaleTemplateDefault.address
        );
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
            const initData = await encodeInitDataFixedPrice(
                saleLauncher.address,
                1,
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultMinCommitment,
                defaultMaxCommitment,
                defaultMinRaise,
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

            const initData = await encodeInitDataFixedPrice(
                saleLauncher.address,
                1,
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultMinCommitment,
                defaultMaxCommitment,
                defaultMinRaise,
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

            const initData = await encodeInitDataFixedPrice(
                saleLauncher.address,
                1,
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultMinCommitment,
                defaultMaxCommitment,
                defaultMinRaise,
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
