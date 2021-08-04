import { expect } from "chai";
import { BigNumber } from "ethers";
import hre, { ethers, waffle } from "hardhat";

import { expandTo18Decimals } from "./utilities";
import {
    AquaFactory,
    SaleLauncher,
    ERC20Mintable,
    FixedPriceSale,
    ParticipantList,
    TemplateLauncher,
    FixedPriceSaleTemplate,
    ParticipantListLauncher,
    AquaFactory__factory,
    SaleLauncher__factory,
    ERC20Mintable__factory,
    FixedPriceSale__factory,
    ParticipantList__factory,
    TemplateLauncher__factory,
    FixedPriceSaleTemplate__factory,
    ParticipantListLauncher__factory,
} from "../../typechain";

import "@nomiclabs/hardhat-ethers";

describe("FixedPriceSaleTemplate", async () => {
    const [templateManager, user_2] = waffle.provider.getWallets();
    let saleLauncher: SaleLauncher;
    let aquaFactory: AquaFactory;
    let tokenA: ERC20Mintable;
    let tokenB: ERC20Mintable;
    let templateLauncher: TemplateLauncher;
    let participantListTemplate: ParticipantList;
    let participantListLauncher: ParticipantListLauncher;
    let fixedPriceSaleTemplate: FixedPriceSaleTemplate;
    let fixedPriceSale: FixedPriceSale;
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
        tokenSupplier: string,
        tokenOut: string,
        tokenIn: string,
        tokenPrice: BigNumber,
        tokensForSale: BigNumber,
        startDate: number,
        endDate: number,
        minCommitment: BigNumber,
        maxCommitment: BigNumber,
        minRaise: BigNumber,
        participantList: boolean
    ) {
        return ethers.utils.defaultAbiCoder.encode(
            [
                "address",
                "uint256",
                "address",
                "address",
                "address",
                "uint256",
                "uint256",
                "uint256",
                "uint256",
                "uint256",
                "uint256",
                "uint256",
                "bool",
            ],
            [
                saleLauncher,
                saleTemplateId,
                tokenSupplier,
                tokenOut,
                tokenIn,
                tokenPrice,
                tokensForSale,
                startDate,
                endDate,
                minCommitment,
                maxCommitment,
                minRaise,
                participantList,
            ]
        );
    }

    beforeEach(async () => {
        currentBlockNumber = await ethers.provider.getBlockNumber();
        currentBlock = await ethers.provider.getBlock(currentBlockNumber);

        defaultStartDate = currentBlock.timestamp + 500;
        defaultEndDate = defaultStartDate + 86400; // 24 hours

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

        const FixedPriceSaleTemplate =
            await ethers.getContractFactory<FixedPriceSaleTemplate__factory>(
                "FixedPriceSaleTemplate"
            );
        fixedPriceSaleTemplate = await FixedPriceSaleTemplate.deploy();

        const FixedPriceSale =
            await ethers.getContractFactory<FixedPriceSale__factory>(
                "FixedPriceSale"
            );
        fixedPriceSale = await FixedPriceSale.deploy();
        await saleLauncher.addTemplate(fixedPriceSale.address);

        const ERC20 =
            await hre.ethers.getContractFactory<ERC20Mintable__factory>(
                "ERC20Mintable"
            );
        tokenA = await ERC20.deploy("tokenA", "tokA");
        tokenB = await ERC20.deploy("tokenB", "tokB");
        await tokenB.mint(templateManager.address, expandTo18Decimals(3000));
    });

    it("can only initialize once", async () => {
        const initData = encodeInitDataFixedPrice(
            saleLauncher.address,
            1,
            templateManager.address,
            tokenA.address,
            tokenB.address,
            defaultTokenPrice,
            defaultTokensForSale,
            defaultStartDate,
            defaultEndDate,
            defaultMinCommitment,
            defaultMaxCommitment,
            defaultMinRaise,
            false
        );

        await expect(fixedPriceSaleTemplate.init(initData))
            .to.emit(fixedPriceSaleTemplate, "TemplateInitialized")
            .withArgs(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultMinCommitment,
                defaultMaxCommitment,
                defaultMinRaise,
                false
            );

        await expect(fixedPriceSaleTemplate.init(initData)).to.be.revertedWith(
            "FixedPriceSaleTemplate: ALEADY_INITIALIZED"
        );
    });

    it("only tokenSupplier can create Sale", async () => {
        const initData = encodeInitDataFixedPrice(
            saleLauncher.address,
            1,
            templateManager.address,
            tokenA.address,
            tokenB.address,
            defaultTokenPrice,
            defaultTokensForSale,
            defaultStartDate,
            defaultEndDate,
            defaultMinCommitment,
            defaultMaxCommitment,
            defaultMinRaise,
            true
        );

        await expect(fixedPriceSaleTemplate.init(initData))
            .to.emit(fixedPriceSaleTemplate, "TemplateInitialized")
            .withArgs(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultMinCommitment,
                defaultMaxCommitment,
                defaultMinRaise,
                true
            );

        await expect(
            fixedPriceSaleTemplate.connect(user_2).createSale()
        ).to.be.revertedWith("FixedPriceSaleTemplate: FORBIDDEN");

        await tokenB.approve(saleLauncher.address, defaultTokensForSale);
        await fixedPriceSaleTemplate.createSale({
            value: 500,
        });
    });

    it("only tokenSupplier can manage the participantList", async () => {
        const initData = encodeInitDataFixedPrice(
            saleLauncher.address,
            1,
            templateManager.address,
            tokenA.address,
            tokenB.address,
            defaultTokenPrice,
            defaultTokensForSale,
            defaultStartDate,
            defaultEndDate,
            defaultMinCommitment,
            defaultMaxCommitment,
            defaultMinRaise,
            true
        );

        const launchedTemplate = await fixedPriceSaleTemplate.init(initData);

        const launchedTemplateTx = await ethers.provider.getTransactionReceipt(
            launchedTemplate.hash
        );

        const participantListAddress = ethers.utils.hexStripZeros(
            launchedTemplateTx.logs[1].topics[1]
        );

        const participantList = ParticipantList__factory.connect(
            participantListAddress,
            templateManager
        );

        expect(await participantList.isInList(user_2.address)).to.be.equal(
            false
        );

        await expect(
            participantList
                .connect(user_2)
                .setParticipantAmounts([user_2.address], [100])
        ).to.be.revertedWith("ParticipantList: FORBIDDEN");

        await participantList
            .connect(templateManager)
            .setParticipantAmounts([user_2.address], [100]);

        expect(await participantList.isInList(user_2.address)).to.be.equal(
            true
        );
    });
});
