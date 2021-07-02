import { expect } from "chai";
import { Contract, BigNumber, utils } from "ethers";
import hre, { ethers, waffle } from "hardhat";

import { mineBlock, expandTo18Decimals } from "./utilities";
import "@nomiclabs/hardhat-ethers";

describe("FixedPriceSale", async () => {
    const [user_1, user_2] = waffle.provider.getWallets();
    let fixedPriceSale: Contract;
    let saleIntialized: Contract;
    let tokenA: Contract;
    let tokenB: Contract;
    let currentBlockNumber, currentBlock;

    const defaultTokenPrice = expandTo18Decimals(10);
    const defaultTokensForSale = expandTo18Decimals(2000);
    const defaultminCommitment = expandTo18Decimals(2);
    const defaultmaxCommitment = expandTo18Decimals(10);
    const defaultMinRaise = expandTo18Decimals(5000);
    let defaultStartDate: number;
    let defaultEndDate: number;

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

    beforeEach(async () => {
        currentBlockNumber = await ethers.provider.getBlockNumber();
        currentBlock = await ethers.provider.getBlock(currentBlockNumber);

        defaultStartDate = currentBlock.timestamp + 500;
        defaultEndDate = defaultStartDate + 86400; // 24 hours

        const FixedPriceSale = await ethers.getContractFactory(
            "FixedPriceSale"
        );

        const ERC20 = await hre.ethers.getContractFactory("ERC20Mintable");

        fixedPriceSale = await FixedPriceSale.deploy();
        saleIntialized = await FixedPriceSale.deploy();

        tokenA = await ERC20.deploy("tokenA", "tokA");
        tokenB = await ERC20.deploy("tokenB", "tokB");

        await tokenA.mint(user_1.address, BigNumber.from(10).pow(30));
        await tokenB.mint(user_1.address, BigNumber.from(10).pow(30));

        await tokenB.approve(saleIntialized.address, defaultTokensForSale);

        const initData = await encodeInitData(
            tokenA.address,
            tokenB.address,
            defaultTokenPrice,
            defaultTokensForSale,
            defaultStartDate,
            defaultEndDate,
            defaultminCommitment,
            defaultmaxCommitment,
            defaultMinRaise,
            user_1.address,
            ethers.constants.AddressZero
        );

        await saleIntialized.init(initData);
    });
    describe("initiate sale", async () => {
        it("throws if token is used for both tokenA and tokenB", async () => {
            const initData = await encodeInitData(
                tokenA.address,
                tokenA.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                defaultMinRaise,
                user_1.address,
                ethers.constants.AddressZero
            );

            await expect(fixedPriceSale.init(initData)).to.be.revertedWith(
                "FixedPriceSale: invalid tokens"
            );
        });

        it("throws if token price is zero", async () => {
            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                BigNumber.from(0),
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                defaultMinRaise,
                user_1.address,
                ethers.constants.AddressZero
            );

            await expect(fixedPriceSale.init(initData)).to.be.revertedWith(
                "FixedPriceSale: invalid tokenPrice"
            );
        });

        it("throws if tokensForSale is zero", async () => {
            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                BigNumber.from(0),
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                defaultMinRaise,
                user_1.address,
                ethers.constants.AddressZero
            );

            await expect(fixedPriceSale.init(initData)).to.be.revertedWith(
                "FixedPriceSale: invalid tokensForSale"
            );
        });

        it("throws if startDate is in the past", async () => {
            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate - 1000,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                defaultMinRaise,
                user_1.address,
                ethers.constants.AddressZero
            );

            await expect(fixedPriceSale.init(initData)).to.be.revertedWith(
                "FixedPriceSale: invalid startDate"
            );
        });

        it("throws if endDate is before startDate", async () => {
            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultEndDate,
                defaultStartDate,
                defaultminCommitment,
                defaultmaxCommitment,
                defaultMinRaise,
                user_1.address,
                ethers.constants.AddressZero
            );

            await expect(fixedPriceSale.init(initData)).to.be.revertedWith(
                "FixedPriceSale: invalid endDate"
            );
        });

        it("initializes sale", async () => {
            tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                defaultMinRaise,
                user_1.address,
                ethers.constants.AddressZero
            );

            await expect(fixedPriceSale.init(initData))
                .to.emit(fixedPriceSale, "SaleInitialized")
                .withArgs(
                    tokenA.address,
                    tokenB.address,
                    defaultTokenPrice,
                    defaultTokensForSale,
                    defaultStartDate,
                    defaultEndDate,
                    defaultminCommitment,
                    defaultmaxCommitment,
                    defaultMinRaise,
                    user_1.address,
                    ethers.constants.AddressZero
                )
                .to.emit(tokenB, "Transfer")
                .withArgs(
                    user_1.address,
                    fixedPriceSale.address,
                    defaultTokensForSale
                );
        });
    });

    describe("purchasig tokens", async () => {
        it("throws trying to purchase less tokens then minCommitment", async () => {
            await expect(
                saleIntialized.commitTokens(expandTo18Decimals(1))
            ).to.be.revertedWith("FixedPriceSale: amount to low");
        });

        it("throws trying to purchase more tokens then maxCommitment", async () => {
            await expect(
                saleIntialized.commitTokens(expandTo18Decimals(11))
            ).to.be.revertedWith("FixedPriceSale: maxCommitment reached");
        });

        it("throws trying to purchase tokens after endDate", async () => {
            await mineBlock(defaultEndDate + 1000);
            await expect(
                saleIntialized.commitTokens(expandTo18Decimals(10))
            ).to.be.revertedWith("FixedPriceSale: deadline passed");
        });

        it("throws trying to purchase after sale is closed", async () => {
            tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                expandTo18Decimals(0),
                user_1.address,
                ethers.constants.AddressZero
            );

            await fixedPriceSale.init(initData);
            await mineBlock(defaultEndDate + 100);
            await fixedPriceSale.closeSale();

            await expect(
                fixedPriceSale.commitTokens(expandTo18Decimals(10))
            ).to.be.revertedWith("FixedPriceSale: sale closed");
        });

        it("allows to purchase tokens", async () => {
            await tokenA.approve(
                saleIntialized.address,
                expandTo18Decimals(10)
            );

            expect(await saleIntialized.remainingTokensForSale()).to.be.equal(
                defaultTokensForSale
            );

            await expect(
                saleIntialized.commitTokens(expandTo18Decimals(10))
            ).to.be.revertedWith("FixedPriceSale: sale not started");

            await mineBlock(defaultStartDate);

            await expect(saleIntialized.commitTokens(expandTo18Decimals(10)))
                .to.emit(saleIntialized, "NewCommitment")
                .withArgs(user_1.address, expandTo18Decimals(10))
                .to.emit(tokenA, "Transfer")
                .withArgs(
                    user_1.address,
                    saleIntialized.address,
                    expandTo18Decimals(10)
                );

            expect(await saleIntialized.remainingTokensForSale()).to.be.equal(
                expandTo18Decimals(1900)
            );

            await mineBlock(defaultEndDate - 100);
            expect(await saleIntialized.secondsRemainingInSale()).to.be.equal(
                100
            );

            await mineBlock(defaultEndDate + 100);
            expect(await saleIntialized.secondsRemainingInSale()).to.be.equal(
                0
            );
        });
        it("allows the same investor repeated purchase of tokens", async () => {
            await tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                expandTo18Decimals(0),
                user_1.address,
                ethers.constants.AddressZero
            );

            await fixedPriceSale.init(initData);

            await tokenA.approve(fixedPriceSale.address, expandTo18Decimals(9));

            expect(await fixedPriceSale.remainingTokensForSale()).to.be.equal(
                defaultTokensForSale
            );

            await mineBlock(defaultStartDate);

            await expect(fixedPriceSale.commitTokens(expandTo18Decimals(2)))
                .to.emit(fixedPriceSale, "NewCommitment")
                .withArgs(user_1.address, expandTo18Decimals(2))
                .to.emit(tokenA, "Transfer")
                .withArgs(
                    user_1.address,
                    fixedPriceSale.address,
                    expandTo18Decimals(2)
                );

            await expect(fixedPriceSale.commitTokens(expandTo18Decimals(3)))
                .to.emit(fixedPriceSale, "NewCommitment")
                .withArgs(user_1.address, expandTo18Decimals(3))
                .to.emit(tokenA, "Transfer")
                .withArgs(
                    user_1.address,
                    fixedPriceSale.address,
                    expandTo18Decimals(3)
                );

            await expect(fixedPriceSale.commitTokens(expandTo18Decimals(4)))
                .to.emit(fixedPriceSale, "NewCommitment")
                .withArgs(user_1.address, expandTo18Decimals(4))
                .to.emit(tokenA, "Transfer")
                .withArgs(
                    user_1.address,
                    fixedPriceSale.address,
                    expandTo18Decimals(4)
                );

            expect(await fixedPriceSale.remainingTokensForSale()).to.be.equal(
                expandTo18Decimals(1910)
            );

            await mineBlock(defaultEndDate - 100);
            expect(await fixedPriceSale.secondsRemainingInSale()).to.be.equal(
                100
            );

            await mineBlock(defaultEndDate + 100);
            expect(await fixedPriceSale.secondsRemainingInSale()).to.be.equal(
                0
            );

            await fixedPriceSale.closeSale();

            await expect(fixedPriceSale.withdrawTokens(user_1.address))
                .to.emit(fixedPriceSale, "NewTokenWithdraw")
                .withArgs(user_1.address, expandTo18Decimals(90));
        });
    });

    describe("closing sale", async () => {
        it("throws trying to close sale twice", async () => {
            tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                expandTo18Decimals(0),
                user_1.address,
                ethers.constants.AddressZero
            );

            await fixedPriceSale.init(initData);
            await mineBlock(defaultEndDate + 100);
            await expect(fixedPriceSale.closeSale()).to.emit(
                fixedPriceSale,
                "SaleClosed"
            );
            await expect(fixedPriceSale.closeSale()).to.be.revertedWith(
                "FixedPriceSale: already closed"
            );
        });

        it("throws trying to close sale before endDate", async () => {
            tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                expandTo18Decimals(0),
                user_1.address,
                ethers.constants.AddressZero
            );

            await fixedPriceSale.init(initData);
            await mineBlock(defaultEndDate - 10);
            await expect(fixedPriceSale.closeSale()).to.be.revertedWith(
                "FixedPriceSale: sale cannot be closed"
            );
        });

        it("throws trying to close sale without minRaise reached & before endDate", async () => {
            tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                expandTo18Decimals(10),
                user_1.address,
                ethers.constants.AddressZero
            );

            await fixedPriceSale.init(initData);
            await mineBlock(defaultEndDate - 10);
            await expect(fixedPriceSale.closeSale()).to.be.revertedWith(
                "FixedPriceSale: sale cannot be closed"
            );
        });

        it("allows closing sale", async () => {
            tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                expandTo18Decimals(10),
                user_1.address,
                ethers.constants.AddressZero
            );

            await fixedPriceSale.init(initData);
            await tokenA.approve(
                fixedPriceSale.address,
                expandTo18Decimals(10)
            );
            await mineBlock(defaultStartDate);
            await fixedPriceSale.commitTokens(expandTo18Decimals(10));
            await mineBlock(defaultEndDate + 100);

            await expect(fixedPriceSale.closeSale()).to.emit(
                fixedPriceSale,
                "SaleClosed"
            );
        });
    });

    describe("releasing tokens for sale not reached raise goal", async () => {
        it("throws trying to release tokens for sales without minRaise", async () => {
            tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                expandTo18Decimals(0),
                user_1.address,
                ethers.constants.AddressZero
            );

            await fixedPriceSale.init(initData);
            await tokenA.approve(
                fixedPriceSale.address,
                expandTo18Decimals(10)
            );

            await mineBlock(defaultStartDate);
            await fixedPriceSale.commitTokens(expandTo18Decimals(10));

            await expect(
                fixedPriceSale.withdrawTokens(user_1.address)
            ).to.be.revertedWith("FixedPriceSale: not closed yet");
        });
        it("throws trying to release tokens for sales before endDate passed", async () => {
            tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                expandTo18Decimals(10),
                user_1.address,
                ethers.constants.AddressZero
            );

            await fixedPriceSale.init(initData);
            await tokenA.approve(
                fixedPriceSale.address,
                expandTo18Decimals(10)
            );

            await mineBlock(defaultStartDate);
            await fixedPriceSale.commitTokens(expandTo18Decimals(10));

            await expect(
                fixedPriceSale.withdrawTokens(user_1.address)
            ).to.be.revertedWith("FixedPriceSale: not closed yet");
        });

        it("throws trying to release tokens for sales if no tokens purchased", async () => {
            tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                expandTo18Decimals(10),
                user_1.address,
                ethers.constants.AddressZero
            );

            await fixedPriceSale.init(initData);
            await mineBlock(defaultEndDate + 100);
            await expect(
                fixedPriceSale.withdrawTokens(user_1.address)
            ).to.be.revertedWith("FixedPriceSale: nothing to withdraw");
        });

        it("allows releasing tokens back to investor if minRaise was not reached", async () => {
            tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                expandTo18Decimals(20),
                user_1.address,
                ethers.constants.AddressZero
            );

            await fixedPriceSale.init(initData);
            await tokenA.approve(
                fixedPriceSale.address,
                expandTo18Decimals(10)
            );
            await mineBlock(defaultStartDate);
            await fixedPriceSale.commitTokens(expandTo18Decimals(10));
            await mineBlock(defaultEndDate + 100);
            await expect(fixedPriceSale.withdrawTokens(user_1.address))
                .to.emit(fixedPriceSale, "NewTokenRelease")
                .withArgs(user_1.address, expandTo18Decimals(10));
        });
    });

    describe("claiming tokens & withdrawing funds", async () => {
        it("throws trying to close a sale that did not end", async () => {
            await expect(saleIntialized.closeSale()).to.be.revertedWith(
                "FixedPriceSale: sale cannot be closed"
            );
        });

        it("throws trying to claim tokens without purchase", async () => {
            tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                expandTo18Decimals(0),
                user_1.address,
                ethers.constants.AddressZero
            );

            await fixedPriceSale.init(initData);
            await mineBlock(defaultEndDate + 100);
            await fixedPriceSale.closeSale();
            await expect(
                fixedPriceSale.withdrawTokens(user_1.address)
            ).to.be.revertedWith("FixedPriceSale: nothing to withdraw");
        });

        it("allows claiming tokens after sale closing with 3 purchase", async () => {
            tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                expandTo18Decimals(0),
                user_1.address,
                ethers.constants.AddressZero
            );

            await fixedPriceSale.init(initData);
            await tokenA.approve(
                fixedPriceSale.address,
                expandTo18Decimals(10)
            );
            await mineBlock(defaultStartDate);
            await fixedPriceSale.commitTokens(expandTo18Decimals(2));
            await fixedPriceSale.commitTokens(expandTo18Decimals(3));
            await fixedPriceSale.commitTokens(expandTo18Decimals(4));

            await mineBlock(defaultEndDate + 100);
            await fixedPriceSale.closeSale();

            await expect(fixedPriceSale.withdrawTokens(user_1.address))
                .to.emit(fixedPriceSale, "NewTokenWithdraw")
                .withArgs(user_1.address, expandTo18Decimals(90));
        });

        it("allows withdrawing tokens after sale closing by user", async () => {
            tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                expandTo18Decimals(0),
                user_1.address,
                ethers.constants.AddressZero
            );

            await fixedPriceSale.init(initData);
            await tokenA.approve(
                fixedPriceSale.address,
                expandTo18Decimals(10)
            );
            await mineBlock(defaultStartDate);
            await fixedPriceSale.commitTokens(expandTo18Decimals(10));

            await mineBlock(defaultEndDate + 100);
            await fixedPriceSale.closeSale();

            await expect(fixedPriceSale.withdrawTokens(user_1.address))
                .to.emit(fixedPriceSale, "NewTokenWithdraw")
                .withArgs(user_1.address, expandTo18Decimals(100));
        });

        it("allows withdrawing tokens for other users", async () => {
            tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                expandTo18Decimals(0),
                user_1.address,
                ethers.constants.AddressZero
            );

            await fixedPriceSale.init(initData);
            await tokenA.approve(
                fixedPriceSale.address,
                expandTo18Decimals(10)
            );
            await mineBlock(defaultStartDate);
            await fixedPriceSale.commitTokens(expandTo18Decimals(10));

            await mineBlock(defaultEndDate + 100);
            await fixedPriceSale.closeSale();

            await expect(
                fixedPriceSale.connect(user_2).withdrawTokens(user_1.address)
            )
                .to.emit(fixedPriceSale, "NewTokenWithdraw")
                .withArgs(user_1.address, expandTo18Decimals(100));
        });

        it("allows withdrawing unsold tokens", async () => {
            tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                expandTo18Decimals(0),
                user_1.address,
                ethers.constants.AddressZero
            );

            await fixedPriceSale.init(initData);
            await tokenA.approve(
                fixedPriceSale.address,
                expandTo18Decimals(10)
            );
            await mineBlock(defaultStartDate);
            await fixedPriceSale.commitTokens(expandTo18Decimals(10));

            await expect(fixedPriceSale.closeSale()).to.be.revertedWith(
                "FixedPriceSale: sale cannot be closed"
            );

            await mineBlock(defaultEndDate + 100);

            const remainingTokes =
                await fixedPriceSale.remainingTokensForSale();

            await expect(fixedPriceSale.closeSale())
                .to.emit(tokenB, "Transfer")
                .withArgs(
                    fixedPriceSale.address,
                    user_1.address,
                    remainingTokes
                );
        });

        it("allows withdrawing funds", async () => {
            tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                expandTo18Decimals(0),
                user_1.address,
                ethers.constants.AddressZero
            );

            await fixedPriceSale.init(initData);
            await tokenA.approve(
                fixedPriceSale.address,
                expandTo18Decimals(10)
            );
            await mineBlock(defaultStartDate);
            await fixedPriceSale.commitTokens(expandTo18Decimals(10));

            await expect(fixedPriceSale.closeSale()).to.be.revertedWith(
                "FixedPriceSale: sale cannot be closed"
            );

            await mineBlock(defaultEndDate + 100);

            await expect(fixedPriceSale.closeSale())
                .to.emit(tokenA, "Transfer")
                .withArgs(
                    fixedPriceSale.address,
                    user_1.address,
                    expandTo18Decimals(10)
                );
        });

        it("allows only owner to withdraw ERC20", async () => {
            tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                expandTo18Decimals(0),
                user_1.address,
                ethers.constants.AddressZero
            );

            await fixedPriceSale.init(initData);
            await tokenA.approve(
                fixedPriceSale.address,
                expandTo18Decimals(10)
            );
            await tokenA.transfer(
                fixedPriceSale.address,
                expandTo18Decimals(10)
            );

            await expect(
                fixedPriceSale.ERC20Withdraw(
                    tokenA.address,
                    expandTo18Decimals(1)
                )
            ).to.be.revertedWith("FixedPriceSale: sale not closed");

            await mineBlock(defaultEndDate + 100);
            await fixedPriceSale.closeSale();

            await expect(
                fixedPriceSale
                    .connect(user_2)
                    .ERC20Withdraw(tokenA.address, expandTo18Decimals(1))
            ).to.be.revertedWith("FixedPriceSale: FORBIDDEN");

            await expect(
                fixedPriceSale.ERC20Withdraw(
                    tokenA.address,
                    expandTo18Decimals(1)
                )
            )
                .to.emit(tokenA, "Transfer")
                .withArgs(
                    fixedPriceSale.address,
                    user_1.address,
                    expandTo18Decimals(1)
                );
        });

        it("allows only owner to withdraw ETH", async () => {
            tokenB.approve(fixedPriceSale.address, defaultTokensForSale);

            const initData = await encodeInitData(
                tokenA.address,
                tokenB.address,
                defaultTokenPrice,
                defaultTokensForSale,
                defaultStartDate,
                defaultEndDate,
                defaultminCommitment,
                defaultmaxCommitment,
                expandTo18Decimals(0),
                user_1.address,
                ethers.constants.AddressZero
            );

            await fixedPriceSale.init(initData);

            await user_1.sendTransaction({
                to: fixedPriceSale.address,
                value: expandTo18Decimals(10),
            });

            await expect(
                fixedPriceSale.ETHWithdraw(expandTo18Decimals(1))
            ).to.be.revertedWith("FixedPriceSale: sale not closed");

            await mineBlock(defaultEndDate + 100);
            await fixedPriceSale.closeSale();

            await expect(
                fixedPriceSale
                    .connect(user_2)
                    .ETHWithdraw(expandTo18Decimals(1))
            ).to.be.revertedWith("FixedPriceSale: FORBIDDEN");
            const balanceBefore = await user_1.getBalance();
            await fixedPriceSale.ETHWithdraw(expandTo18Decimals(1));
            expect(await user_1.getBalance()).to.be.above(balanceBefore);
        });
    });
});
