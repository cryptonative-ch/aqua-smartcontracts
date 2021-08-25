import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers, waffle } from "hardhat";
import "@nomiclabs/hardhat-ethers";

import { expandTo18Decimals } from "./utilities";
import {
    FairSale,
    AquaFactory,
    SaleLauncher,
    ERC20Mintable,
    TemplateLauncher,
    FairSaleTemplate,
    FairSale__factory,
    AquaFactory__factory,
    SaleLauncher__factory,
    ERC20Mintable__factory,
    TemplateLauncher__factory,
    FairSaleTemplate__factory,
} from "../../typechain";

describe("FairSaleTemplate", async () => {
    const [templateManager, user_2] = waffle.provider.getWallets();
    let saleLauncher: SaleLauncher;
    let aquaFactory: AquaFactory;
    let tokenA: ERC20Mintable;
    let tokenB: ERC20Mintable;
    let templateLauncher: TemplateLauncher;
    let fairSaleTemplate: FairSaleTemplate;
    let fairSale: FairSale;
    let currentBlockNumber, currentBlock;

    const defaultTokensForSale = expandTo18Decimals(2000);
    const defaultMinRaise = expandTo18Decimals(5000);
    const defaultMinPrice = expandTo18Decimals(1);
    const defaultMinBuyAmount = expandTo18Decimals(1);
    const defaultMinimumBiddingAmountPerOrder = expandTo18Decimals(10);

    let defaultOrderCancelationPeriodDuration: number;
    let defaultStartDate: number;
    let defaultEndDate: number;

    function encodeInitDataFairSale(
        saleLauncher: string,
        saleTemplateId: number,
        tokenIn: string,
        tokenOut: string,
        auctionStartDate: number,
        auctionEndDate: number,
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
                auctionStartDate,
                auctionEndDate,
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
        defaultEndDate = defaultStartDate + 86400;
        defaultOrderCancelationPeriodDuration = currentBlock.timestamp + 3600;

        aquaFactory = await new AquaFactory__factory(templateManager).deploy(
            templateManager.address,
            templateManager.address,
            templateManager.address,
            0,
            0,
            0
        );

        templateLauncher = await new TemplateLauncher__factory(
            templateManager
        ).deploy(aquaFactory.address, ethers.constants.AddressZero);

        await aquaFactory.setTemplateLauncher(templateLauncher.address);

        saleLauncher = await new SaleLauncher__factory(templateManager).deploy(
            aquaFactory.address
        );

        fairSaleTemplate = await new FairSaleTemplate__factory(
            templateManager
        ).deploy();

        fairSale = await new FairSale__factory(templateManager).deploy();
        await saleLauncher.addTemplate(fairSale.address);

        tokenA = await new ERC20Mintable__factory(templateManager).deploy(
            "tokenA",
            "tokA"
        );
        tokenB = await new ERC20Mintable__factory(templateManager).deploy(
            "tokenB",
            "tokB"
        );

        await tokenB.mint(templateManager.address, expandTo18Decimals(3000));
    });

    it("can only initialize once", async () => {
        const initData = encodeInitDataFairSale(
            saleLauncher.address,
            1,
            tokenA.address,
            tokenB.address,
            defaultStartDate,
            defaultEndDate,
            defaultTokensForSale,
            defaultMinPrice,
            defaultMinBuyAmount,
            defaultMinRaise,
            defaultOrderCancelationPeriodDuration,
            defaultMinimumBiddingAmountPerOrder,
            templateManager.address
        );

        await expect(fairSaleTemplate.init(initData))
            .to.emit(fairSaleTemplate, "TemplateInitialized")
            .withArgs(
                tokenA.address,
                tokenB.address,
                defaultStartDate,
                defaultEndDate,
                defaultTokensForSale,
                defaultMinPrice,
                defaultMinBuyAmount,
                defaultMinRaise,
                defaultOrderCancelationPeriodDuration,
                defaultMinimumBiddingAmountPerOrder
            );

        await expect(fairSaleTemplate.init(initData)).to.be.revertedWith(
            "FairSaleTemplate: ALEADY_INITIALIZED"
        );
    });

    it("only tokenSupplier can create Sale", async () => {
        const initData = encodeInitDataFairSale(
            saleLauncher.address,
            1,
            tokenA.address,
            tokenB.address,
            defaultStartDate,
            defaultEndDate,
            defaultTokensForSale,
            defaultMinPrice,
            defaultMinBuyAmount,
            defaultMinRaise,
            defaultOrderCancelationPeriodDuration,
            defaultMinimumBiddingAmountPerOrder,
            templateManager.address
        );

        await expect(fairSaleTemplate.init(initData))
            .to.emit(fairSaleTemplate, "TemplateInitialized")
            .withArgs(
                tokenA.address,
                tokenB.address,
                defaultStartDate,
                defaultEndDate,
                defaultTokensForSale,
                defaultMinPrice,
                defaultMinBuyAmount,
                defaultMinRaise,
                defaultOrderCancelationPeriodDuration,
                defaultMinimumBiddingAmountPerOrder
            );

        await expect(
            fairSaleTemplate.connect(user_2).createSale()
        ).to.be.revertedWith("FairSaleTemplate: FORBIDDEN");

        await tokenB.approve(saleLauncher.address, expandTo18Decimals(3000));
        await expect(fairSaleTemplate.createSale()).not.to.be.reverted;
    });
});
