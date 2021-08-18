const { task, ethers } = require("hardhat/config");

task("launchFairSale", "Starts a new auction from FairSale template")
    .addParam("saleLauncher", "The address of the Aqua Sale Launcher")
    .addParam("saleTemplateId", "The id of Aqua FairSale Template")
    .addParam(
        "tokenOut",
        "The ERC20's address of the token that should be sold"
    )
    .addParam(
        "tokenIn",
        "The ERC20's address of the token that should be bought"
    )
    .addParam(
        "duration",
        "Describes how long the auction should last in seconds"
    )
    .addParam(
        "tokenOutSupply",
        "The amount of auctioningTokens to be sold in atoms"
    )
    .addParam("minPrice", "minimum Price that token should be auctioned for")
    .addParam(
        "minBuyAmount",
        "The amount of biddingToken to be bought at least for selling sellAmount in atoms"
    )
    .addParam("minRaise", "minimum amount an project is expected to raise")
    .addParam("tokenSupplier", "address that deposits the selling tokens")
    .setAction(async (taskArguments, hre) => {
        const {
            saleLauncher,
            saleTemplateId,
            tokenOut,
            tokenIn,
            tokenOutSupply,
            minBuyAmount,
            minRaise,
            duration,
            minPrice,
            tokenSupplier,
        } = taskArguments;

        const [caller] = await hre.ethers.getSigners();
        console.log(
            "Launching new FixedPriceSale using the account:",
            caller.address,
            "..."
        );

        const saleLauncherAdd = await hre.ethers.getContractAt(
            "SaleLauncher",
            saleLauncher
        );
        const factoryAddress = await saleLauncherAdd.factory();
        const aquaFactory = await hre.ethers.getContractAt(
            "AquaFactory",
            factoryAddress
        );

        const initData = await encodeInitDataFairSale(
            saleLauncher,
            saleTemplateId,
            tokenOut,
            tokenIn,
            duration,
            tokenOutSupply,
            minPrice,
            minBuyAmount,
            minRaise,
            tokenSupplier
        );

        const launchTemplateTx = await aquaFactory.launchTemplate(
            saleTemplateId,
            initData
        );

        console.log(
            "Launched Template succesfully! Trasaction: " +
                launchTemplateTx.hash
        );
    });

function encodeInitDataFairSale(
    saleLauncher,
    saleTemplateId,
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
            saleTemplateId,
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
/* Example: 

npx hardhat launchFairSale \
--sale-launcher 0xF9008327125bB1315a4577F034E4FF5C81248d90 \
--sale-template-id 1 \
--token-out 0xF9008327125bB1315a4577F034E4FF5C81248d90 \
--token-in 0xF9008327125bB1315a4577F034E4FF5C81248d90 \
--duration 10000 \
--token-out-supply 1000 \
--min-price 10 \
--min-buy-amount 10 \
--min-raise 100000 \
--token-supplier 0xF9008327125bB1315a4577F034E4FF5C81248d90 \
--network rinkeby

*/
