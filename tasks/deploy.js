const { task } = require("hardhat/config");
const { ethers } = require("ethers");

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
  .addParam("auctionFee", "Fixed fee to create auctions")
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
        auctionFee,
        templateManager,
        templateFee,
        verify,
        weth
      } = taskArguments;

      await hre.run("clean");
      await hre.run("compile");

      const MesaFactory = hre.artifacts.require(
        "MesaFactory"
      );

      const mesaFactory = await MesaFactory.new();

      const AuctionLauncher = hre.artifacts.require(
          "contracts/auctions/AuctionLauncher.sol:AuctionLauncher"
      );

      const auctionLauncher = await AuctionLauncher.new(
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
        auctionFee
      );

      // Deploy EasyAuction
      const EasyAuction = hre.artifacts.require(
        "EasyAuction"
      );
      const easyAuction = await EasyAuction.new();

       // Deploy FixedPriceAuction
       const FixedPriceAuction = hre.artifacts.require(
        "FixedPriceAuction"
      );
      const fixedPriceAuction = await FixedPriceAuction.new();

      // Register EasyAuction & FixedPriceAuction in AuctionLauncher
      const auctionLaunch1 = await auctionLauncher.addTemplate(easyAuction.address);
      const auctionLaunch2 = await auctionLauncher.addTemplate(fixedPriceAuction.address);

      const auction1 = auctionLaunch1.receipt.logs[0].args.templateId;
      const auction2 = auctionLaunch2.receipt.logs[0].args.templateId;

      // Deploy EasyAuctionTemplate
      const EasyAuctionTemplate = hre.artifacts.require(
        "EasyAuctionTemplate"
      );
      
      const easyAuctionTemplate = await EasyAuctionTemplate.new(
         weth,
         auctionLauncher.address,
         auction1
      );
      
      // Register EasyAuctionTemplate on TemplateLauncher
      await templateLauncher.addTemplate(easyAuctionTemplate.address);

      if (verify) {

          await hre.run("verify", {
              address: mesaFactory.address,
          });

          await hre.run("verify", {
            address: easyAuction.address,
          });

          await hre.run("verify", {
            address: fixedPriceAuction.address,
          });

          await hre.run("verify:verify", {
            address: auctionLauncher.address,
            constructorArguments: [mesaFactory.address,],
          });

          await hre.run("verify:verify", {
            address: templateLauncher.address,
            constructorArguments: [mesaFactory.address,],
          });

          await hre.run("verify:verify", {
            address: easyAuctionTemplate.address,
            constructorArguments: [
              weth,
              auctionLauncher.address,
              "1",
            ],
          });

          console.log(`verified contracts successfully`);
      }

      console.log(
        `MesaFactory deployed at ${mesaFactory.address}`
      );

      console.log(
          `AuctionLauncher deployed at address ${auctionLauncher.address}`
      );

      console.log(`TemplateLauncher deployed at address ${templateLauncher.address}`);
  });

  function encodeInitData(
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
            "address",
            "uint256",
            "uint256",
            "uint96",
            "uint96",
            "uint256",
            "address",
        ],
        [
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