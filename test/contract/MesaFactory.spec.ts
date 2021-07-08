import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import hre, { ethers, waffle } from "hardhat";
import "@nomiclabs/hardhat-ethers";

describe("AquaFactory", async () => {
    let aquaFactory: Contract;
    const [owner, user_2] = waffle.provider.getWallets();

    beforeEach(async () => {
        const AquaFactory = await ethers.getContractFactory("AquaFactory");

        aquaFactory = await AquaFactory.deploy(
            owner.address,
            owner.address,
            owner.address,
            0,
            0,
            0
        );
    });

    describe("governance parameters", async () => {
        it("only feeManager can update setFeeTo", async () => {
            await expect(
                aquaFactory.connect(user_2).setFeeTo(user_2.address)
            ).to.be.revertedWith("AquaFactory: FORBIDDEN");

            await expect(aquaFactory.setFeeTo(user_2.address))
                .to.emit(aquaFactory, "FeeToUpdated")
                .withArgs(user_2.address);
        });

        it("only feeManager can update feeNumerator", async () => {
            await expect(
                aquaFactory.connect(user_2).setFeeNumerator(10)
            ).to.be.revertedWith("AquaFactory: FORBIDDEN");

            await expect(aquaFactory.setFeeNumerator(10))
                .to.emit(aquaFactory, "FeeNumeratorUpdated")
                .withArgs(10);
        });

        it("only feeManager can update saleFee", async () => {
            await expect(
                aquaFactory.connect(user_2).setSaleFee(10)
            ).to.be.revertedWith("AquaFactory: FORBIDDEN");

            await expect(aquaFactory.setSaleFee(10))
                .to.emit(aquaFactory, "SaleFeeUpdated")
                .withArgs(10);
        });

        it("only feeManager can update templateFee", async () => {
            await expect(
                aquaFactory.connect(user_2).setTemplateFee(10)
            ).to.be.revertedWith("AquaFactory: FORBIDDEN");

            await expect(aquaFactory.setTemplateFee(10))
                .to.emit(aquaFactory, "TemplateFeeUpdated")
                .withArgs(10);
        });

        it("only feeManager can update feeManager", async () => {
            await expect(
                aquaFactory.connect(user_2).setFeeManager(user_2.address)
            ).to.be.revertedWith("AquaFactory: FORBIDDEN");

            await expect(aquaFactory.setFeeManager(user_2.address))
                .to.emit(aquaFactory, "FeeManagerUpdated")
                .withArgs(user_2.address);
        });

        it("only templateManager can update templateManager", async () => {
            await expect(
                aquaFactory.connect(user_2).setTemplateManager(user_2.address)
            ).to.be.revertedWith("AquaFactory: FORBIDDEN");

            await expect(aquaFactory.setTemplateManager(user_2.address))
                .to.emit(aquaFactory, "TemplateManagerUpdated")
                .withArgs(user_2.address);
        });

        it("only templateManager can update templateLauncher", async () => {
            await expect(
                aquaFactory.connect(user_2).setTemplateLauncher(user_2.address)
            ).to.be.revertedWith("AquaFactory: FORBIDDEN");

            await expect(aquaFactory.setTemplateLauncher(user_2.address))
                .to.emit(aquaFactory, "TemplateLauncherUpdated")
                .withArgs(user_2.address);
        });
    });
});
