const { task, ethers } = require("hardhat/config");

task("launchFixedPriceSale", "Starts a new sale from FixedPriceSale template")
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
    .addParam("tokenSupplier", "address that deposits the selling tokens")
    .addParam("tokenPrice", "price of one tokenOut")
    .addParam("tokensForSale", "amount of tokens to be sold")
    .addParam("startDate", "unix timestamp when the sale starts")
    .addParam("endDate", "unix timestamp when the sale ends")
    .addParam(
        "minCommitment",
        "minimum amount of tokens an investor needs to purchase"
    )
    .addParam(
        "maxCommitment",
        "maximum amount of tokens an investor can purchase"
    )
    .addParam(
        "minRaise",
        "sale goal – if not reached investors can claim back tokens"
    )
    .addParam("owner", "address for privileged functions")
    .setAction(async (taskArguments, hre) => {
        const {
            saleLauncher,
            saleTemplateId,
            tokenOut,
            tokenIn,
            tokenSupplier,
            tokenPrice,
            tokensForSale,
            startDate,
            endDate,
            minCommitment,
            maxCommitment,
            minRaise,
            owner,
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

        const initData = encodeInitDataFixedPrice(
            saleLauncher,
            saleTemplateId,
            tokenOut,
            tokenIn,
            tokenSupplier,
            tokenPrice,
            tokensForSale,
            startDate,
            endDate,
            minCommitment,
            maxCommitment,
            minRaise,
            owner
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

function encodeInitDataFixedPrice(
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
    owner
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
            "address",
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
            owner,
        ]
    );
}

/* Example: 

npx hardhat launchFixedPriceSale \
--sale-launcher 0xF9008327125bB1315a4577F034E4FF5C81248d90 \
--sale-template-id 1 \
--token-out 0xF9008327125bB1315a4577F034E4FF5C81248d90 \
--token-in 0xF9008327125bB1315a4577F034E4FF5C81248d90 \
--token-supplier 0xF9008327125bB1315a4577F034E4FF5C81248d90 \
--token-price 1 \
--tokens-for-sale 100 \
--start-date 1617692420 \
--end-date 1917692420 \
--allocation-min 1 \
--allocation-max 1000 \
--minimum-raise 100000 \
--owner 0xF9008327125bB1315a4577F034E4FF5C81248d90 \
--network rinkeby

*/
