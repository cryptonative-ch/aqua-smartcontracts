import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import hre, { ethers, waffle } from "hardhat";
import FixedPriceSaleTemplate from "../../build/artifacts/contracts/templates/FairSaleTemplate.sol/FairSaleTemplate.json";
import "@nomiclabs/hardhat-ethers";

import { expandTo18Decimals } from "./utilities";

describe("TemplateLauncher", async () => {
    const [templateManager, user_2] = waffle.provider.getWallets();
    let saleLauncher: Contract;
    let aquaFactory: Contract;
    let templateLauncher: Contract;
    let fixedPriceSale: Contract;
    let fixedPriceSaleTemplate: Contract;
    let fixedPriceSaleTemplateDefault: Contract;
    let newFixedPriceSaleTemplate: Contract;
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
        tokenSupplier: string,
        tokenIn: string,
        tokenOut: string,
        tokenPrice: BigNumber,
        tokensForSale: BigNumber,
        startDate: number,
        endDate: number,
        minCommitment: BigNumber,
        maxCommitment: BigNumber,
        minRaise: BigNumber,
        partipantList: boolean
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
                tokenIn,
                tokenOut,
                tokenPrice,
                tokensForSale,
                startDate,
                endDate,
                minCommitment,
                maxCommitment,
                minRaise,
                partipantList,
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

        const FixedPriceSaleTemplate = await ethers.getContractFactory(
            "FixedPriceSaleTemplate"
        );

        fixedPriceSaleTemplate = await FixedPriceSaleTemplate.deploy();

        fixedPriceSaleTemplateDefault = await FixedPriceSaleTemplate.deploy();

        const FixedPriceSale = await ethers.getContractFactory(
            "FixedPriceSale"
        );
        fixedPriceSale = await FixedPriceSale.deploy();

        defaultTemplate = await saleLauncher.addTemplate(
            fixedPriceSale.address
        );
    });
    describe("adding templates", async () => {
        it("throws if template added by non-admin & public templates are turned off", async () => {
            await expect(
                templateLauncher
                    .connect(user_2)
                    .addTemplate(fixedPriceSaleTemplateDefault.address)
            ).to.be.revertedWith("TemplateLauncher: FORBIDDEN");
        });

        it("throws if template is added twice", async () => {
            await templateLauncher.addTemplate(
                fixedPriceSaleTemplateDefault.address
            );

            await expect(
                templateLauncher.addTemplate(
                    fixedPriceSaleTemplateDefault.address
                )
            ).to.be.revertedWith("TemplateLauncher: TEMPLATE_DUPLICATE");
        });

        it("throws if template fee is not provided", async () => {
            await aquaFactory.setTemplateFee(500);

            await expect(
                templateLauncher.addTemplate(
                    fixedPriceSaleTemplateDefault.address
                )
            ).to.be.revertedWith("TemplateLauncher: TEMPLATE_FEE_NOT_PROVIDED");
        });

        it("allows everybody to add new templates if restriction is turned off", async () => {
            await aquaFactory.setTemplateFee(500);
            await templateLauncher.toggleAllowPublicTemplates();

            await expect(
                templateLauncher
                    .connect(user_2)
                    .addTemplate(fixedPriceSaleTemplateDefault.address, {
                        value: 500,
                    })
            )
                .to.emit(templateLauncher, "TemplateAdded")
                .withArgs(fixedPriceSaleTemplateDefault.address, 1);
        });

        it("allows template manager to add new templates if restriction is turned on", async () => {
            await aquaFactory.setTemplateFee(500);

            expect(
                await templateLauncher.getTemplateId(
                    fixedPriceSaleTemplateDefault.address
                )
            ).to.be.equal(0);

            await expect(
                templateLauncher.addTemplate(
                    fixedPriceSaleTemplateDefault.address,
                    {
                        value: 500,
                    }
                )
            )
                .to.emit(templateLauncher, "TemplateAdded")
                .withArgs(fixedPriceSaleTemplateDefault.address, 1);

            expect(
                await templateLauncher.getTemplateId(
                    fixedPriceSaleTemplateDefault.address
                )
            ).to.be.equal(1);
            expect(await templateLauncher.getTemplate(1)).to.be.equal(
                fixedPriceSaleTemplateDefault.address
            );
        });
    });

    describe("removing templates", async () => {
        it("throws if trying to remove a template by othen then template manager", async () => {
            await templateLauncher.addTemplate(
                fixedPriceSaleTemplateDefault.address
            );
            await expect(
                templateLauncher.connect(user_2).removeTemplate(1)
            ).to.be.revertedWith("TemplateLauncher: FORBIDDEN");
        });

        it("allows template manager to remove templates", async () => {
            await templateLauncher.addTemplate(
                fixedPriceSaleTemplateDefault.address
            );
            await expect(templateLauncher.removeTemplate(1))
                .to.emit(templateLauncher, "TemplateRemoved")
                .withArgs(fixedPriceSaleTemplateDefault.address, 1);
        });
    });

    describe("verifying templates", async () => {
        it("throws if trying to verify a template by othen then template manager", async () => {
            await templateLauncher.addTemplate(
                fixedPriceSaleTemplateDefault.address
            );
            await expect(
                templateLauncher.connect(user_2).verifyTemplate(1)
            ).to.be.revertedWith("TemplateLauncher: FORBIDDEN");
        });

        it("allows template manager to verify templates", async () => {
            await templateLauncher.addTemplate(
                fixedPriceSaleTemplateDefault.address
            );
            await expect(templateLauncher.verifyTemplate(1))
                .to.emit(templateLauncher, "TemplateVerified")
                .withArgs(fixedPriceSaleTemplateDefault.address, 1);
        });
    });

    describe("launching sales", async () => {
        it("throws if trying to launch template not through factory", async () => {
            const initData = await encodeInitDataFixedPrice(
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

            await expect(
                templateLauncher.launchTemplate(
                    3,
                    initData,
                    "0x",
                    templateManager.address
                )
            ).to.be.revertedWith("TemplateLauncher: FORBIDDEN");
        });

        it("throws if trying to launch invalid templateId", async () => {
            const initData = await encodeInitDataFixedPrice(
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

            await expect(
                aquaFactory.launchTemplate(3, initData, "0x")
            ).to.be.revertedWith("TemplateLauncher: INVALID_TEMPLATE");
        });

        it("throws if trying to launch template without providing fee", async () => {
            await aquaFactory.setSaleFee(500);

            const initData = await encodeInitDataFixedPrice(
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

            await expect(
                aquaFactory.launchTemplate(1, initData, "0x")
            ).to.be.revertedWith("TemplateLauncher: SALE_FEE_NOT_PROVIDED");
        });

        it("allows to launch a template through factory", async () => {
            await aquaFactory.setSaleFee(500);
            await templateLauncher.addTemplate(
                fixedPriceSaleTemplateDefault.address
            );

            const initData = await encodeInitDataFixedPrice(
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

            await tokenB.mint(
                templateManager.address,
                expandTo18Decimals(5000)
            );
            await tokenB.approve(
                saleLauncher.address,
                expandTo18Decimals(5000)
            );
            await tokenA.mint(
                templateManager.address,
                expandTo18Decimals(5000)
            );
            await tokenA.approve(
                saleLauncher.address,
                expandTo18Decimals(5000)
            );

            expect(await aquaFactory.numberOfTemplates()).to.be.equal(0);
            const launchedTemplate = await aquaFactory.launchTemplate(
                1,
                initData,
                "0x",
                {
                    value: 500,
                }
            );

            expect(await aquaFactory.numberOfTemplates()).to.be.equal(1);

            const launchedTemplateTx =
                await ethers.provider.getTransactionReceipt(
                    launchedTemplate.hash
                );

            newFixedPriceSaleTemplate = new ethers.Contract(
                launchedTemplateTx.logs[1].address,
                FixedPriceSaleTemplate.abi,
                templateManager
            );

            await newFixedPriceSaleTemplate
                .connect(templateManager)
                .createSale({
                    value: 500,
                });
        });

        it("only templateDeployer can update Metadata", async () => {
            await aquaFactory.setSaleFee(500);
            await templateLauncher.addTemplate(
                fixedPriceSaleTemplateDefault.address
            );

            const initData = await encodeInitDataFixedPrice(
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

            await tokenB.mint(
                templateManager.address,
                expandTo18Decimals(5000)
            );
            await tokenB.approve(
                saleLauncher.address,
                expandTo18Decimals(5000)
            );
            await tokenA.mint(
                templateManager.address,
                expandTo18Decimals(5000)
            );
            await tokenA.approve(
                saleLauncher.address,
                expandTo18Decimals(5000)
            );

            const launchedTemplate = await aquaFactory.launchTemplate(
                1,
                initData,
                "0x",
                {
                    value: 500,
                }
            );

            const launchedTemplateTx =
                await ethers.provider.getTransactionReceipt(
                    launchedTemplate.hash
                );

            newFixedPriceSaleTemplate = new ethers.Contract(
                launchedTemplateTx.logs[1].address,
                FixedPriceSaleTemplate.abi,
                templateManager
            );

            await expect(
                templateLauncher
                    .connect(user_2)
                    .updateTemplateMetadataContentHash(
                        newFixedPriceSaleTemplate.address,
                        "1x"
                    )
            ).to.be.revertedWith("TemplateLauncher: FORBIDDEN");

            await expect(
                templateLauncher.updateTemplateMetadataContentHash(
                    newFixedPriceSaleTemplate.address,
                    "1x"
                )
            )
                .to.emit(templateLauncher, "TemplateMetadataContentHashUpdated")
                .withArgs(newFixedPriceSaleTemplate.address, "1x");
        });
    });
});
