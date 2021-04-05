const { task } = require("hardhat/config");

task("launchFixedPriceSale", "Starts a new auction from FixedPriceSale template")
        .addParam(
          "saleLauncher",
          "The address of the Mesa Sale Launcher"
        )
        .addParam(
          "auctionTemplateId",
          "The id of Mesa FairSale Template"
        )
        .addParam(
            "tokenOut",
            "The ERC20's address of the token that should be sold"
        )
        .addParam(
            "tokenIn",
            "The ERC20's address of the token that should be bought"
        )
        .setAction(async (taskArgs, hre) => {
          const {
            saleLauncher,
            auctionTemplateId,
            tokenOut,
            tokenIn,
          } = taskArguments;

            const [caller] = await hre.ethers.getSigners();
            console.log("Using the account:", caller.address);

            tokenOut = await hre.ethers.getContractAt(
                "ERC20",
                tokenOut
            );
            tokenIn = await hre.ethers.getContractAt(
                "ERC20",
                tokenIn
            );
          
        });