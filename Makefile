renameVarEa:
	bash helpers/sed_rename_vars.sh contracts/auctions/EasyAuction.sol
	bash helpers/sed_rename_vars.sh src/priceCalculation.ts
	bash helpers/sed_rename_vars.sh test/contract/EasyAuction.spec.ts
	bash helpers/sed_rename_vars.sh test/contract/EasyAuctionE2E.spec.ts
	bash helpers/sed_rename_vars.sh test/contract/IteratableOrderSet.spec.ts
	bash helpers/sed_rename_vars.sh test/src/calculatePrice.spec.ts
	
	
renameVarEaReverse:
	git checkout contracts/auctions/EasyAuction.sol
	git checkout src/priceCalculation.ts
	git checkout test/contract/EasyAuction.spec.ts
	git checkout test/contract/EasyAuctionE2E.spec.ts
	git checkout test/contract/IteratableOrderSet.spec.ts
	git checkout test/src/calculatePrice.spec.ts
	rm -v contracts/auctions/EasyAuction.sol.diff
	rm -v src/priceCalculation.ts
	rm -v test/contract/EasyAuction.spec.ts.diff
	rm -v test/contract/EasyAuctionE2E.spec.ts.diff
	rm -v test/contract/IteratableOrderSet.spec.ts.diff
	rm -v test/src/calculatePrice.spec.ts.diff

renameVarShowChange:
	less -R contracts/auctions/EasyAuction.sol.diff
	less -R test/contract/EasyAuction.spec.ts.diff
	less -R test/contract/EasyAuctionE2E.spec.ts.diff

hardhatRunTests:
	yarn hardhat test
