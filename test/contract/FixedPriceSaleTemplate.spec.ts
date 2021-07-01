import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import hre, { ethers, waffle } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import ParticipantList from "../../build/artifacts/contracts/participants/ParticipantList.sol/ParticipantList.json";

import { expandTo18Decimals } from "./utilities";

const [templateManager, user_2] = waffle.provider.getWallets();
let saleLauncher: Contract;
let mesaFactory: Contract;
let tokenA: Contract;
let tokenB: Contract;
let templateLauncher: Contract;
let participantListTemplate: Contract;
let participantListLauncher: Contract;
let participantList: Contract;
let fixedPriceSaleTemplate: Contract;
let fixedPriceSale: Contract;
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

    const MesaFactory = await ethers.getContractFactory("MesaFactory");
    mesaFactory = await MesaFactory.deploy(
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
        mesaFactory.address,
        participantListTemplate.address
    );

    const TemplateLauncher = await ethers.getContractFactory(
        "TemplateLauncher"
    );

    templateLauncher = await TemplateLauncher.deploy(
        mesaFactory.address,
        participantListLauncher.address
    );

    await mesaFactory.setTemplateLauncher(templateLauncher.address);

    const SaleLauncher = await ethers.getContractFactory("SaleLauncher");
    saleLauncher = await SaleLauncher.deploy(mesaFactory.address);

    const FixedPriceSaleTemplate = await ethers.getContractFactory(
        "FixedPriceSaleTemplate"
    );
    fixedPriceSaleTemplate = await FixedPriceSaleTemplate.deploy();

    const FixedPriceSale = await ethers.getContractFactory("FixedPriceSale");
    fixedPriceSale = await FixedPriceSale.deploy();
    await saleLauncher.addTemplate(fixedPriceSale.address);

    const ERC20 = await hre.ethers.getContractFactory("ERC20Mintable");
    tokenA = await ERC20.deploy("tokenA", "tokA");
    tokenB = await ERC20.deploy("tokenB", "tokB");
    await tokenB.mint(templateManager.address, expandTo18Decimals(3000));
});
describe("FixedPriceSaleTemplate", async () => {
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

    it.skip("only tokenSupplier can manage the participantList", async () => {
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

        const launchedTemplateTx =
            await ethers.provider.getTransactionReceipt(
                launchedTemplate.hash
        );


        console.log("topic", launchedTemplateTx.logs[1].topics[1])
        const participantListAddress = ethers.utils.zeroPad(launchedTemplateTx.logs[1].topics[1],20)

        console.log("participantListAddress", participantListAddress)
        /*
        console.log(participantListAddress)
        participantList = new ethers.Contract(
            participantListAddress,
            ParticipantList.abi,
            templateManager
        );

        await participantList.connect(user_2).setParticipantAmounts([user_2.address],[100])
        await participantList.connect(templateManager).setParticipantAmounts([user_2.address],[100])
        */
    });
});
