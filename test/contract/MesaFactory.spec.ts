import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import hre, { ethers, waffle } from "hardhat";
import "@nomiclabs/hardhat-ethers";

describe("MesaFactory", async () => {
    let mesaFactory: Contract;
    const [owner, user_2] = waffle.provider.getWallets();

    beforeEach(async () => {
        const MesaFactory = await ethers.getContractFactory("MesaFactory");

        mesaFactory = await MesaFactory.deploy(
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
                mesaFactory.connect(user_2).setFeeTo(user_2.address)
            ).to.be.revertedWith("MesaFactory: FORBIDDEN");

            await expect(mesaFactory.setFeeTo(user_2.address))
                .to.emit(mesaFactory, "FeeToUpdated")
                .withArgs(user_2.address);
        });

        it("only feeManager can update feeNumerator", async () => {
            await expect(
                mesaFactory.connect(user_2).setFeeNumerator(10)
            ).to.be.revertedWith("MesaFactory: FORBIDDEN");

            await expect(mesaFactory.setFeeNumerator(10))
                .to.emit(mesaFactory, "FeeNumeratorUpdated")
                .withArgs(10);
        });

        it("only feeManager can update saleFee", async () => {
            await expect(
                mesaFactory.connect(user_2).setSaleFee(10)
            ).to.be.revertedWith("MesaFactory: FORBIDDEN");

            await expect(mesaFactory.setSaleFee(10))
                .to.emit(mesaFactory, "SaleFeeUpdated")
                .withArgs(10);
        });

        it("only feeManager can update templateFee", async () => {
            await expect(
                mesaFactory.connect(user_2).setTemplateFee(10)
            ).to.be.revertedWith("MesaFactory: FORBIDDEN");

            await expect(mesaFactory.setTemplateFee(10))
                .to.emit(mesaFactory, "TemplateFeeUpdated")
                .withArgs(10);
        });

        it("only feeManager can update feeManager", async () => {
            await expect(
                mesaFactory.connect(user_2).setFeeManager(user_2.address)
            ).to.be.revertedWith("MesaFactory: FORBIDDEN");

            await expect(mesaFactory.setFeeManager(user_2.address))
                .to.emit(mesaFactory, "FeeManagerUpdated")
                .withArgs(user_2.address);
        });

        it("only templateManager can update templateManager", async () => {
            await expect(
                mesaFactory.connect(user_2).setTemplateManager(user_2.address)
            ).to.be.revertedWith("MesaFactory: FORBIDDEN");

            await expect(mesaFactory.setTemplateManager(user_2.address))
                .to.emit(mesaFactory, "TemplateManagerUpdated")
                .withArgs(user_2.address);
        });

        it("only templateManager can update templateLauncher", async () => {
            await expect(
                mesaFactory.connect(user_2).setTemplateLauncher(user_2.address)
            ).to.be.revertedWith("MesaFactory: FORBIDDEN");

            await expect(mesaFactory.setTemplateLauncher(user_2.address))
                .to.emit(mesaFactory, "TemplateLauncherUpdated")
                .withArgs(user_2.address);
        });
    });
});
