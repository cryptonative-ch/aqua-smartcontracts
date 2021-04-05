const { task } = require("hardhat/config");

task("launchFairSale", "Starts a new auction from FairSale template")
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
        .addParam(
            "tokenOutSupply",
            "The amount of auctioningTokens to be sold in atoms"
        )
        .addParam(
            "minBuyAmount",
            "The amount of biddingToken to be bought at least for selling sellAmount in atoms"
        )
        .addOptionalParam(
            "minFundingThreshold",
            "The minimal funding threshold for executing the settlement. If funding is not reached, everyone will get back their investment",
            "0",
            types.string
        )
        .addOptionalParam(
            "orderCancellationPeriod",
            "Describes how long the auction should allow to cancel orders in seconds",
            "360000",
            types.string
        )
        .addOptionalParam(
            "duration",
            "Describes how long the auction should last in seconds",
            "360000",
            types.string
        )
        .addOptionalParam(
            "minBuyAmountPerOrder",
            "Describes the minimal buyAmount per order placed in the auction. This can be used in order to protect against too high gas costs for the settlement",
            "0.01",
            types.string
        )
        .addOptionalParam(
            "isAtomicClosureAllowed",
            "Describes whether the auction should be allowed to be closed atomically",
            "false",
            types.string
        )
        .setAction(async (taskArguments, hre) => {
          const {
            saleLauncher,
            auctionTemplateId,
            tokenOut,
            tokenIn,
            tokenOutSupply,
            minBuyAmount,
            minFundingThreshold,
            orderCancellationPeriod,
            duration,
            minBuyAmountPerOrder,
            isAtomicClosureAllowed
          } = taskArguments;

            const [caller] = await hre.ethers.getSigners();
            console.log("Using the account:", caller.address);

            /*
            const tokenOutContract = await hre.ethers.getContractAt(
                "ERC20",
                tokenOut
            );
            const tokenInContract = await hre.ethers.getContractAt(
                "ERC20",
                tokenIn
            );
            */

            const saleLauncherContract = await ethers.getContractAt(
              "SaleLauncher",
              saleLauncher,
            );

            console.log("SaleLauncheeeeer: " + saleLauncherContract.address)

            await saleLauncherContract.callStatic.numberOfSales()


            /*
            const mesaFactoryAddress = await saleLauncherContract.callStatic.factory()

            console.log("Factorrrrry : " + mesaFactoryAddress)

            */

            /*
            const mesaFactory  = await hre.ethers.getContractAt(
              "MesaFactory",
              mesaFactoryAddress
            );

            const ERC20 = await hre.artifacts.require("ERC20Mintable");
            const tokenA = await ERC20.new("tokenA", "tokA");
            await tokenA.mint(caller.address, 50);
            const tokenB = await ERC20.new("tokenB", "tokB");

            const initData = await encodeInitDataFairSale(
              saleLauncher,
              1,
              tokenA.address,
              tokenB.address,
              500,
              20,
              5,
              5,
              20,
              caller.address
          );

          await tokenA.mint(caller.address, 50);
          await tokenA.approve(saleLauncher, 50);

          const launchedTemplate = await mesaFactory.launchTemplate(1, initData, {
              value: 500,
          });

          /*
          const newFairSaleTemplate = new ethers.Contract(
            launchedTemplate.receipt.logs[1].address,
              FairSaleTemplate.abi,
              owner
          );
          
          console.log("Deployed Template :"+ launchedTemplate.receipt.logs[1].address)

          */
          
          /*
          await newFairSaleTemplate.createSale({
              value: 500,
          });
          */

            /*
            const sellAmountsInAtoms = ethers.utils.parseUnits(
                taskArgs.sellAmount,
                await auctioningToken.callStatic.decimals()
            );
            const minBuyAmountInAtoms = ethers.utils.parseUnits(
                taskArgs.minBuyAmount,
                await biddingToken.callStatic.decimals()
            );
            const minParticipantsBuyAmount = ethers.utils.parseUnits(
                taskArgs.minBuyAmountPerOrder,
                await biddingToken.callStatic.decimals()
            );
            const minFundingThresholdInAtoms = ethers.utils.parseUnits(
                taskArgs.minFundingThreshold,
                await biddingToken.callStatic.decimals()
            );

            console.log("Using FairSale deployed to:", fairSale.address);

            const allowance = await auctioningToken.callStatic.allowance(
                caller.address,
                fairSale.address
            );
            if (sellAmountsInAtoms.gt(allowance)) {
                console.log("Approving tokens:");
                const tx = await auctioningToken
                    .connect(caller)
                    .approve(fairSale.address, sellAmountsInAtoms);
                await tx.wait();
                console.log("Done");
            }

            console.log("Starting Auction:");
            const tx = await fairSale
                .connect(caller)
                .initiateAuction(
                    auctioningToken.address,
                    biddingToken.address,
                    taskArgs.orderCancellationPeriod,
                    taskArgs.duration,
                    sellAmountsInAtoms,
                    minBuyAmountInAtoms,
                    minParticipantsBuyAmount,
                    minFundingThresholdInAtoms,
                    taskArgs.isAtomicClosureAllowed
                );
            const txResult = await tx.wait();
            console.log(
                "Your auction has been schedule and has the Id:",
                auctionId.toString()
            );
            */
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

// Rinkeby tests task selling WETH for DAI:
// yarn hardhat initiateAuction --auctioning-token "0xc778417e063141139fce010982780140aa0cd5ab" --bidding-token "0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa" --sell-amount 0.1 --min-buy-amount 50 --network rinkeby
