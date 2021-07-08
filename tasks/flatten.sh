mkdir ./contracts/.flattened
npx hardhat flatten ./contracts/AquaFactory.sol > ./contracts/.flattened/AquaFactory.sol
npx hardhat flatten ./contracts/sales/SaleLauncher.sol > ./contracts/.flattened/SaleLauncher.sol
npx hardhat flatten ./contracts/sales/FairSale.sol > ./contracts/.flattened/FairSale.sol
npx hardhat flatten ./contracts/sales/FixedPriceSale.sol > ./contracts/.flattened/FixedPriceSale.sol
npx hardhat flatten ./contracts/templates/TemplateLauncher.sol > ./contracts/.flattened/TemplateLauncher.sol
npx hardhat flatten ./contracts/templates/FairSaleTemplate.sol > ./contracts/.flattened/FairSaleTemplate.sol
npx hardhat flatten ./contracts/templates/FixedPriceSaleTemplate.sol > ./contracts/.flattened/FixedPriceSaleTemplate.sol