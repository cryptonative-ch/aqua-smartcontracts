import { expect } from "chai";
import { Contract, BigNumber, utils } from "ethers";
import hre, { ethers, waffle } from "hardhat";

import { mineBlock, expandTo18Decimals } from "./utilities";
import "@nomiclabs/hardhat-ethers";
import { parseEther } from "ethers/lib/utils";

describe("E2E: FixedPriceSale", async () => {
    const [idoManager, user_1, user_2, user_3, user_4] =
        waffle.provider.getWallets();
    let fixedPriceSale: Contract;
    let saleIntialized: Contract;
    let aToken: Contract;
    let daiToken: Contract;
    let currentBlockNumber, currentBlock;

    let startDate: number;
    let endDate: number;

    function encodeInitData(
        tokenIn: string,
        tokenOut: string,
        tokenPrice: BigNumber,
        tokensForSale: BigNumber,
        startDate: number,
        endDate: number,
        minCommitment: BigNumber,
        maxCommitment: BigNumber,
        minRaise: BigNumber,
        owner: string,
        partipantList: string
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
                "address",
            ],
            [
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
                partipantList,
            ]
        );
    }

    describe("Test Sale: Selling 100 ATokens for 1 DAI each", async () => {
        beforeEach("deploy sale", async () => {
            const tokenPrice = expandTo18Decimals(1);
            const tokensForSale = expandTo18Decimals(100);
            const minCommitment = expandTo18Decimals(10);
            const maxCommitment = expandTo18Decimals(40);
            const minRaise = expandTo18Decimals(30);

            currentBlockNumber = await ethers.provider.getBlockNumber();
            currentBlock = await ethers.provider.getBlock(currentBlockNumber);

            startDate = currentBlock.timestamp + 500;
            endDate = startDate + 86400; // 24 hours

            const FixedPriceSale = await ethers.getContractFactory(
                "FixedPriceSale"
            );

            const ERC20 = await hre.ethers.getContractFactory("ERC20Mintable");

            fixedPriceSale = await FixedPriceSale.deploy();
            saleIntialized = await FixedPriceSale.deploy();

            aToken = await ERC20.deploy("aToken", "aToken");
            daiToken = await ERC20.deploy("daiToken", "dai");

            await aToken.mint(idoManager.address, tokensForSale);
            await aToken
                .connect(idoManager)
                .approve(saleIntialized.address, tokensForSale);
            await daiToken.mint(user_1.address, tokensForSale);
            await daiToken
                .connect(user_1)
                .approve(saleIntialized.address, tokensForSale);
            await daiToken.mint(user_2.address, tokensForSale);
            await daiToken
                .connect(user_2)
                .approve(saleIntialized.address, tokensForSale);
            await daiToken.mint(user_3.address, tokensForSale);
            await daiToken
                .connect(user_3)
                .approve(saleIntialized.address, tokensForSale);

            const initData = await encodeInitData(
                daiToken.address,
                aToken.address,
                tokenPrice,
                tokensForSale,
                startDate,
                endDate,
                minCommitment,
                maxCommitment,
                minRaise,
                idoManager.address,
                ethers.constants.AddressZero
            );

            await saleIntialized.connect(idoManager).init(initData);
        });
        it("distributes amounts correctly", async () => {
            await mineBlock(startDate);
            await saleIntialized
                .connect(user_1)
                .commitTokens(expandTo18Decimals(10));
            await saleIntialized
                .connect(user_2)
                .commitTokens(expandTo18Decimals(30));
            await saleIntialized
                .connect(user_3)
                .commitTokens(expandTo18Decimals(20));
            await mineBlock(endDate);

            await expect(saleIntialized.closeSale())
                .to.emit(daiToken, "Transfer")
                .withArgs(
                    saleIntialized.address,
                    idoManager.address,
                    expandTo18Decimals(60)
                )
                .to.emit(aToken, "Transfer")
                .withArgs(
                    saleIntialized.address,
                    idoManager.address,
                    expandTo18Decimals(40)
                );

            await expect(saleIntialized.withdrawTokens(user_1.address))
                .to.emit(saleIntialized, "NewTokenWithdraw")
                .withArgs(user_1.address, expandTo18Decimals(10));

            await expect(saleIntialized.withdrawTokens(user_2.address))
                .to.emit(saleIntialized, "NewTokenWithdraw")
                .withArgs(user_2.address, expandTo18Decimals(30));

            await expect(saleIntialized.withdrawTokens(user_3.address))
                .to.emit(saleIntialized, "NewTokenWithdraw")
                .withArgs(user_3.address, expandTo18Decimals(20));
        });

        it("closes sale automatically with last commit & distributes amounts correctly", async () => {
            await mineBlock(startDate);
            await saleIntialized
                .connect(user_1)
                .commitTokens(expandTo18Decimals(30));
            await saleIntialized
                .connect(user_2)
                .commitTokens(expandTo18Decimals(30));

            // Commit that hits sale goal, should automatically close sale
            await expect(
                saleIntialized
                    .connect(user_3)
                    .commitTokens(expandTo18Decimals(40))
            )
                .to.emit(daiToken, "Transfer")
                .withArgs(
                    saleIntialized.address,
                    idoManager.address,
                    expandTo18Decimals(100)
                )
                .to.not.emit(aToken, "Transfer");

            await expect(saleIntialized.withdrawTokens(user_1.address))
                .to.emit(saleIntialized, "NewTokenWithdraw")
                .withArgs(user_1.address, expandTo18Decimals(30));

            await expect(saleIntialized.withdrawTokens(user_2.address))
                .to.emit(saleIntialized, "NewTokenWithdraw")
                .withArgs(user_2.address, expandTo18Decimals(30));

            await expect(saleIntialized.withdrawTokens(user_3.address))
                .to.emit(saleIntialized, "NewTokenWithdraw")
                .withArgs(user_3.address, expandTo18Decimals(40));
        });
    });

    describe("Test Sale: Selling 5555 ATokens for 0.1 DAI each", async () => {
        beforeEach("deploy sale", async () => {
            const tokenPrice = expandTo18Decimals(10);
            const tokensForSale = expandTo18Decimals(5555);
            const minCommitment = expandTo18Decimals(10);
            const maxCommitment = expandTo18Decimals(40);
            const minRaise = expandTo18Decimals(50);

            currentBlockNumber = await ethers.provider.getBlockNumber();
            currentBlock = await ethers.provider.getBlock(currentBlockNumber);

            startDate = currentBlock.timestamp + 500;
            endDate = startDate + 86400; // 24 hours

            const FixedPriceSale = await ethers.getContractFactory(
                "FixedPriceSale"
            );

            const ERC20 = await hre.ethers.getContractFactory("ERC20Mintable");

            fixedPriceSale = await FixedPriceSale.deploy();
            saleIntialized = await FixedPriceSale.deploy();

            aToken = await ERC20.deploy("aToken", "aToken");
            daiToken = await ERC20.deploy("daiToken", "dai");

            await aToken.mint(idoManager.address, tokensForSale);
            await aToken
                .connect(idoManager)
                .approve(saleIntialized.address, tokensForSale);
            await daiToken.mint(user_1.address, tokensForSale);
            await daiToken
                .connect(user_1)
                .approve(saleIntialized.address, tokensForSale);
            await daiToken.mint(user_2.address, tokensForSale);
            await daiToken
                .connect(user_2)
                .approve(saleIntialized.address, tokensForSale);
            await daiToken.mint(user_3.address, tokensForSale);
            await daiToken
                .connect(user_3)
                .approve(saleIntialized.address, tokensForSale);
            await daiToken.mint(user_4.address, tokensForSale);
            await daiToken
                .connect(user_4)
                .approve(saleIntialized.address, tokensForSale);

            const initData = await encodeInitData(
                daiToken.address,
                aToken.address,
                tokenPrice,
                tokensForSale,
                startDate,
                endDate,
                minCommitment,
                maxCommitment,
                minRaise,
                idoManager.address,
                ethers.constants.AddressZero
            );

            await saleIntialized.connect(idoManager).init(initData);
        });
        it("distributes amounts correctly", async () => {
            await mineBlock(startDate);
            await saleIntialized
                .connect(user_1)
                .commitTokens(expandTo18Decimals(20));
            await saleIntialized
                .connect(user_2)
                .commitTokens(expandTo18Decimals(25));
            await saleIntialized
                .connect(user_3)
                .commitTokens(utils.parseEther("27.60"));
            await saleIntialized
                .connect(user_4)
                .commitTokens(utils.parseEther("13.31420"));
            await mineBlock(endDate);

            await expect(saleIntialized.closeSale())
                .to.emit(daiToken, "Transfer")
                .withArgs(
                    saleIntialized.address,
                    idoManager.address,
                    utils.parseEther("85.9142")
                )
                .to.emit(aToken, "Transfer")
                .withArgs(
                    saleIntialized.address,
                    idoManager.address,
                    utils.parseEther("4695.858")
                );

            await expect(saleIntialized.withdrawTokens(user_1.address))
                .to.emit(saleIntialized, "NewTokenWithdraw")
                .withArgs(user_1.address, expandTo18Decimals(200));

            await expect(saleIntialized.withdrawTokens(user_2.address))
                .to.emit(saleIntialized, "NewTokenWithdraw")
                .withArgs(user_2.address, expandTo18Decimals(250));

            await expect(saleIntialized.withdrawTokens(user_3.address))
                .to.emit(saleIntialized, "NewTokenWithdraw")
                .withArgs(user_3.address, expandTo18Decimals(276));

            await expect(saleIntialized.withdrawTokens(user_4.address))
                .to.emit(saleIntialized, "NewTokenWithdraw")
                .withArgs(user_4.address, utils.parseEther("133.142"));
        });
    });

    describe("Test Sale: Selling 1000 ATokens for 8 DAI each", async () => {
        beforeEach("deploy sale", async () => {
            const tokenPrice = utils.parseEther("0.125");
            const tokensForSale = expandTo18Decimals(1000);
            const minCommitment = expandTo18Decimals(50);
            const maxCommitment = expandTo18Decimals(300);
            const minRaise = expandTo18Decimals(500);

            currentBlockNumber = await ethers.provider.getBlockNumber();
            currentBlock = await ethers.provider.getBlock(currentBlockNumber);

            startDate = currentBlock.timestamp + 500;
            endDate = startDate + 86400; // 24 hours

            const FixedPriceSale = await ethers.getContractFactory(
                "FixedPriceSale"
            );

            const ERC20 = await hre.ethers.getContractFactory("ERC20Mintable");

            fixedPriceSale = await FixedPriceSale.deploy();
            saleIntialized = await FixedPriceSale.deploy();

            aToken = await ERC20.deploy("aToken", "aToken");
            daiToken = await ERC20.deploy("daiToken", "dai");

            await aToken.mint(idoManager.address, tokensForSale);
            await aToken
                .connect(idoManager)
                .approve(saleIntialized.address, tokensForSale);
            await daiToken.mint(user_1.address, tokensForSale);
            await daiToken
                .connect(user_1)
                .approve(saleIntialized.address, tokensForSale);
            await daiToken.mint(user_2.address, tokensForSale);
            await daiToken
                .connect(user_2)
                .approve(saleIntialized.address, tokensForSale);
            await daiToken.mint(user_3.address, tokensForSale);
            await daiToken
                .connect(user_3)
                .approve(saleIntialized.address, tokensForSale);
            await daiToken.mint(user_4.address, tokensForSale);
            await daiToken
                .connect(user_4)
                .approve(saleIntialized.address, tokensForSale);

            const initData = await encodeInitData(
                daiToken.address,
                aToken.address,
                tokenPrice,
                tokensForSale,
                startDate,
                endDate,
                minCommitment,
                maxCommitment,
                minRaise,
                idoManager.address,
                ethers.constants.AddressZero
            );

            await saleIntialized.connect(idoManager).init(initData);
        });
        it("distributes amounts correctly", async () => {
            await mineBlock(startDate);
            await saleIntialized
                .connect(user_1)
                .commitTokens(expandTo18Decimals(150));
            await saleIntialized
                .connect(user_2)
                .commitTokens(expandTo18Decimals(300));
            await saleIntialized
                .connect(user_3)
                .commitTokens(expandTo18Decimals(280));
            await saleIntialized
                .connect(user_4)
                .commitTokens(utils.parseEther("250.25412"));
            await mineBlock(endDate);

            await expect(saleIntialized.closeSale())
                .to.emit(daiToken, "Transfer")
                .withArgs(
                    saleIntialized.address,
                    idoManager.address,
                    utils.parseEther("980.25412")
                )
                .to.emit(aToken, "Transfer")
                .withArgs(
                    saleIntialized.address,
                    idoManager.address,
                    utils.parseEther("877.468235")
                );

            await expect(saleIntialized.withdrawTokens(user_1.address))
                .to.emit(saleIntialized, "NewTokenWithdraw")
                .withArgs(user_1.address, utils.parseEther("18.75"));

            await expect(saleIntialized.withdrawTokens(user_2.address))
                .to.emit(saleIntialized, "NewTokenWithdraw")
                .withArgs(user_2.address, utils.parseEther("37.5"));

            await expect(saleIntialized.withdrawTokens(user_3.address))
                .to.emit(saleIntialized, "NewTokenWithdraw")
                .withArgs(user_3.address, expandTo18Decimals(35));

            await expect(saleIntialized.withdrawTokens(user_4.address))
                .to.emit(saleIntialized, "NewTokenWithdraw")
                .withArgs(user_4.address, utils.parseEther("31.281765"));
        });
    });
});
