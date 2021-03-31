import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import hre, { ethers, waffle } from "hardhat";
import "@nomiclabs/hardhat-ethers";

import { mineBlock, expandTo18Decimals } from "./utilities";

describe("TemplateLauncher", async () => {
    const [templateManager, user_2] = waffle.provider.getWallets();
    let saleLauncher: Contract;
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

        const SaleLauncher = await ethers.getContractFactory(
            "SaleLauncher"
        );

        saleLauncher = await SaleLauncher.deploy(mesaFactory.address);

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
            saleLauncher.address,
            1
        );

        easyAuctionTemplateDefault = await EasyAuctionTemplate.deploy(
            weth.address,
            saleLauncher.address,
            1
        );

        defaultTemplate = await saleLauncher.addTemplate(
            easyAuctionTemplateDefault.address
        );
    });
    describe("adding templates", async () => {
        it("throws if template added by non-admin & restricted templates are turned on", async () => {
            await expect(
                templateLauncher
                    .connect(user_2)
                    .addTemplate(easyAuctionTemplateDefault.address)
            ).to.be.revertedWith("TemplateLauncher: FORBIDDEN");
        });

        it("throws if template is added twice", async () => {
            await templateLauncher.addTemplate(
                easyAuctionTemplateDefault.address
            );

            await expect(
                templateLauncher.addTemplate(easyAuctionTemplateDefault.address)
            ).to.be.revertedWith("TemplateLauncher: TEMPLATE_DUPLICATE");
        });

        it("throws if template fee is not provided", async () => {
            await mesaFactory.setTemplateFee(500);

            await expect(
                templateLauncher.addTemplate(easyAuctionTemplateDefault.address)
            ).to.be.revertedWith("TemplateLauncher: TEMPLATE_FEE_NOT_PROVIDED");
        });

        it("allows everybody to add new templates if restriction is turned off", async () => {
            await mesaFactory.setTemplateFee(500);
            await templateLauncher.updateTemplateRestriction(false);

            await expect(
                templateLauncher
                    .connect(user_2)
                    .addTemplate(easyAuctionTemplateDefault.address, {
                        value: 500,
                    })
            )
                .to.emit(templateLauncher, "TemplateAdded")
                .withArgs(easyAuctionTemplateDefault.address, 1);
        });

        it("allows template manager to add new templates if restriction is turned on", async () => {
            await mesaFactory.setTemplateFee(500);

            expect(
                await templateLauncher.getTemplateId(
                    easyAuctionTemplateDefault.address
                )
            ).to.be.equal(0);

            await expect(
                templateLauncher.addTemplate(
                    easyAuctionTemplateDefault.address,
                    {
                        value: 500,
                    }
                )
            )
                .to.emit(templateLauncher, "TemplateAdded")
                .withArgs(easyAuctionTemplateDefault.address, 1);

            expect(
                await templateLauncher.getTemplateId(
                    easyAuctionTemplateDefault.address
                )
            ).to.be.equal(1);
            expect(await templateLauncher.getTemplate(1)).to.be.equal(
                easyAuctionTemplateDefault.address
            );
        });
    });

    describe("removing templates", async () => {
        it("throws if trying to remove a template by othen then template manager", async () => {
            await templateLauncher.addTemplate(
                easyAuctionTemplateDefault.address
            );
            await expect(
                templateLauncher.connect(user_2).removeTemplate(1)
            ).to.be.revertedWith("TemplateLauncher: FORBIDDEN");
        });

        it("allows template manager to remove templates", async () => {
            await templateLauncher.addTemplate(
                easyAuctionTemplateDefault.address
            );
            await expect(templateLauncher.removeTemplate(1))
                .to.emit(templateLauncher, "TemplateRemoved")
                .withArgs(easyAuctionTemplateDefault.address, 1);
        });
    });

    describe("verifying templates", async () => {
        it("throws if trying to verify a template by othen then template manager", async () => {
            await templateLauncher.addTemplate(
                easyAuctionTemplateDefault.address
            );
            await expect(
                templateLauncher.connect(user_2).verifyTemplate(1)
            ).to.be.revertedWith("TemplateLauncher: FORBIDDEN");
        });

        it("allows template manager to verify templates", async () => {
            await templateLauncher.addTemplate(
                easyAuctionTemplateDefault.address
            );
            await expect(templateLauncher.verifyTemplate(1))
                .to.emit(templateLauncher, "TemplateVerified")
                .withArgs(easyAuctionTemplateDefault.address, 1);
        });
    });

    describe("launching auctions", async () => {
        it("throws if trying to launch template not through factory", async () => {
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
                templateLauncher.launchTemplate(3, initData)
            ).to.be.revertedWith("TemplateLauncher: FORBIDDEN");
        });

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
                mesaFactory.launchTemplate(3, initData)
            ).to.be.revertedWith("TemplateLauncher: INVALID_TEMPLATE");
        });

        it("throws if trying to launch template without providing fee", async () => {
            await mesaFactory.setSaleFee(500);

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
                mesaFactory.launchTemplate(1, initData)
            ).to.be.revertedWith("TemplateLauncher: AUCTION_FEE_NOT_PROVIDED");
        });

        it("allows to launch a template through factory", async () => {
          await mesaFactory.setSaleFee(500);

          await templateLauncher.addTemplate(
            easyAuctionTemplateDefault.address
          );

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

          await mesaFactory.launchTemplate(1, initData,{
            value: 500,
        })
      });
    });
});
