const { task } = require("hardhat/config");

task(
  "deploy",
  "Deploys the Mesa Contract suite and verifies on Etherscan"
)
  .addParam("feeManager", "The address which is able to update fees")
  .addParam(
      "feeTo",
      "The receiver of fees"
  )
  .addParam("feeNumerator", "Amount of fees")
  .addParam("weth", "Address of WETH")
  .addParam("saleFee", "Fixed fee to create auctions")
  .addParam("templateManager", "The address which is able to manage templates")
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
        weth
      } = taskArguments;

      const [owner, addr1] = await ethers.getSigners();

      await hre.run("clean");
      await hre.run("compile");

      const MesaFactory = hre.artifacts.require(
        "MesaFactory"
      );

      const mesaFactory = await MesaFactory.new();

      const SaleLauncher = hre.artifacts.require(
          "contracts/sales/SaleLauncher.sol:SaleLauncher"
      );

      const saleLauncher = await SaleLauncher.new(
        mesaFactory.address,
      );

      const TemplateLauncher = hre.artifacts.require(
        "TemplateLauncher"
      );

      const templateLauncher = await TemplateLauncher.new(
        mesaFactory.address,
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
      const FairSale = hre.artifacts.require(
        "FairSale"
      );
      const fairSale = await FairSale.new();

       // Deploy FixedPriceSale
       const FixedPriceSale = hre.artifacts.require(
        "FixedPriceSale"
      );
      const fixedPriceSale = await FixedPriceSale.new();

      // Register FairSale & FixedPriceSale in SaleLauncher
      const saleLaunch1 = await saleLauncher.addTemplate(fairSale.address);
      const saleLaunch2 = await saleLauncher.addTemplate(fixedPriceSale.address);

      const sale1 = saleLaunch1.receipt.logs[0].args.templateId;
      const sale2 = saleLaunch2.receipt.logs[0].args.templateId;

      // Deploy FairSaleTemplate
      const FairSaleTemplate = hre.artifacts.require(
        "FairSaleTemplate"
      );
      
      const fairSaleTemplate = await FairSaleTemplate.new();
      
      // Register FairSaleTemplate on TemplateLauncher
      await templateLauncher.addTemplate(fairSaleTemplate.address);
      
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
            constructorArguments: [mesaFactory.address,],
          });

          await hre.run("verify:verify", {
            address: templateLauncher.address,
            constructorArguments: [mesaFactory.address,],
          });

          await hre.run("verify:verify", {
            address: fairSaleTemplate.address,
          });

          console.log(`verified contracts successfully`);
      }

      console.log(
        `MesaFactory deployed at ${mesaFactory.address}`
      );

      console.log(
          `SaleLauncher deployed at address ${saleLauncher.address}`
      );

      console.log(`TemplateLauncher deployed at address ${templateLauncher.address}`);
  });

  function encodeInitDataFairSale(
    saleLauncher,
    auctionTemplateId,
    tokenOut,
    tokenIn,
    duration,
    tokenOutSupply,
    minPrice,
    minBuyAmount,
    minRaise,
    tokenSupplier
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
            "address",
        ],
        [
            saleLauncher,
            auctionTemplateId,
            tokenOut,
            tokenIn,
            duration,
            tokenOutSupply,
            minPrice,
            minBuyAmount,
            minRaise,
            tokenSupplier,
        ]
    );
}

  function encodeInitData(
    saleLauncher,
    auctionTemplateId,
    tokenOut,
    tokenIn,
    duration,
    tokenOutSupply,
    minPrice,
    minBuyAmount,
    minRaise,
    tokenSupplier
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
            "address",
        ],
        [
            saleLauncher,
            auctionTemplateId,
            tokenOut,
            tokenIn,
            duration,
            tokenOutSupply,
            minPrice,
            minBuyAmount,
            minRaise,
            tokenSupplier,
        ]
    );
}