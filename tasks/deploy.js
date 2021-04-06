const { task } = require("hardhat/config");

task("deploy", "Deploys the Mesa Contract suite and verifies on Etherscan")
    .addParam("feeManager", "The address which is able to update fees")
    .addParam("feeTo", "The receiver of fees")
    .addParam("feeNumerator", "Amount of fees")
    .addParam("weth", "Address of WETH")
    .addParam("saleFee", "Fixed fee to create auctions")
    .addParam(
        "templateManager",
        "The address which is able to manage templates"
    )
    .addParam("templateFee", "The fee which is taken to register a template")
    .addFlag(
        "verify",
        "Additional (and optional) Etherscan contracts verification"
    )
    .setAction(async (taskArguments, hre) => {
        const {
            feeManager,
            feeTo,
            feeNumerator,
            saleFee,
            templateManager,
            templateFee,
            verify,
            weth,
        } = taskArguments;

        const [owner, addr1] = await ethers.getSigners();
        await hre.run("clean");
        await hre.run("compile");

        const MesaFactory = hre.artifacts.require("MesaFactory");

        const mesaFactory = await MesaFactory.new();

        const SaleLauncher = hre.artifacts.require("SaleLauncher");

        const saleLauncher = await SaleLauncher.new(mesaFactory.address);

        const TemplateLauncher = hre.artifacts.require("TemplateLauncher");

        const templateLauncher = await TemplateLauncher.new(
            mesaFactory.address
        );

        // Initializes Factory
        await mesaFactory.initalize(
            feeManager,
            feeTo,
            templateManager,
            templateLauncher.address,
            templateFee,
            feeNumerator,
            saleFee
        );

        // Deploy FairSale
        const FairSale = hre.artifacts.require("FairSale");
        const fairSale = await FairSale.new();

        // Deploy FixedPriceSale
        const FixedPriceSale = hre.artifacts.require("FixedPriceSale");
        const fixedPriceSale = await FixedPriceSale.new();

        // Register FairSale & FixedPriceSale in SaleLauncher
        const saleTemplate1 = await saleLauncher.addTemplate(fairSale.address);
        const saleTemplate2 = await saleLauncher.addTemplate(
            fixedPriceSale.address
        );
        
        // Deploy FairSaleTemplate
        const FairSaleTemplate = hre.artifacts.require("FairSaleTemplate");
        const fairSaleTemplate = await FairSaleTemplate.new();

        // Deploy FixedPriceSaleTemplate
        const FixedPriceSaleTemplate = hre.artifacts.require(
            "FixedPriceSaleTemplate"
        );
        const fixedPriceSaleTemplate = await FixedPriceSaleTemplate.new();

        // Register templates in TemplateLauncher
        await templateLauncher.addTemplate(fairSaleTemplate.address);
        await templateLauncher.addTemplate(fixedPriceSaleTemplate.address);

        if (verify) {
            await hre.run("verify", {
                address: mesaFactory.address,
            });

            await hre.run("verify", {
                address: fairSale.address,
            });

            await hre.run("verify", {
                address: fixedPriceSale.address,
            });

            await hre.run("verify:verify", {
                address: saleLauncher.address,
                constructorArguments: [mesaFactory.address],
            });

            await hre.run("verify:verify", {
                address: templateLauncher.address,
                constructorArguments: [mesaFactory.address],
            });

            await hre.run("verify:verify", {
                address: fairSaleTemplate.address,
            });

            await hre.run("verify:verify", {
                address: fixedPriceSaleTemplate.address,
            });

            console.log(`verified contracts successfully`);
        }

        console.log(`MesaFactory deployed at ${mesaFactory.address}`);

        console.log(`SaleLauncher deployed at address ${saleLauncher.address}`);

        console.log(
            `TemplateLauncher deployed at address ${templateLauncher.address}`
        );

        console.log(
            `FairSaleTemplate deployed at address ${fairSaleTemplate.address}`
        );

        console.log(
            `FixedPriceSaleTemplate deployed at address ${fixedPriceSaleTemplate.address}`
        );
    });
