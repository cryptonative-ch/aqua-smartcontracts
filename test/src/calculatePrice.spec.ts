import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import "mocha";
function json(obj: unknown): unknown {
    return JSON.parse(JSON.stringify(obj));
}

import {
    encodeOrder,
    decodeOrder,
    Order,
    findClearingPrice,
} from "../../src/priceCalculation";

describe("Encoding Orders", () => {
    describe("decodeOrders", () => {
        it("checks that decoding reverts encoding", () => {
            const order: Order = {
                userId: BigNumber.from(1),
                amountToBid: ethers.utils.parseEther("1"),
                amountToBuy: ethers.utils.parseEther("1"),
            };
            expect(json(order)).deep.eq(json(decodeOrder(encodeOrder(order))));
        });
    });
});

describe("Calculate Prices", () => {
    describe("2 different scenario for the clearing price", () => {
        it("one sell order is clearing order", () => {
            const initialOrder = {
                userId: BigNumber.from(1),
                amountToBid: BigNumber.from(2000).mul(
                    ethers.utils.parseEther("1")
                ),
                amountToBuy: BigNumber.from(10).mul(
                    ethers.utils.parseEther("1")
                ),
            };
            const sellOrders: Order[] = [
                {
                    userId: BigNumber.from(1),
                    amountToBid: BigNumber.from(1000).mul(
                        ethers.utils.parseEther("1")
                    ),
                    amountToBuy: BigNumber.from(4).mul(
                        ethers.utils.parseEther("1")
                    ),
                },
                {
                    userId: BigNumber.from(1),
                    amountToBid: BigNumber.from(1500).mul(
                        ethers.utils.parseEther("1")
                    ),
                    amountToBuy: BigNumber.from(135).mul(
                        BigNumber.from(10).pow(BigNumber.from(17))
                    ),
                },
            ];
            const calculatedPrice = findClearingPrice(sellOrders, initialOrder);
            const expectedPrice = {
                userId: BigNumber.from(1),
                amountToBid: sellOrders[1].amountToBid,
                amountToBuy: sellOrders[1].amountToBuy,
            };
            expect(json(expectedPrice)).deep.eq(json(calculatedPrice));
        });
        it("initalOrder is clearing order", () => {
            const initialOrder = {
                userId: BigNumber.from(1),
                amountToBid: BigNumber.from(2000).mul(
                    ethers.utils.parseEther("1")
                ),
                amountToBuy: BigNumber.from(10).mul(
                    ethers.utils.parseEther("1")
                ),
            };
            const sellOrders: Order[] = [
                {
                    userId: BigNumber.from(1),
                    amountToBid: BigNumber.from(1000).mul(
                        ethers.utils.parseEther("1")
                    ),
                    amountToBuy: BigNumber.from(4).mul(
                        ethers.utils.parseEther("1")
                    ),
                },
                {
                    userId: BigNumber.from(1),
                    amountToBid: BigNumber.from(1000).mul(
                        ethers.utils.parseEther("1")
                    ),
                    amountToBuy: BigNumber.from(45).mul(
                        BigNumber.from(10).pow(BigNumber.from(17))
                    ),
                },
            ];
            const calculatedPrice = findClearingPrice(sellOrders, initialOrder);
            const expectedPrice = {
                userId: BigNumber.from(0),
                amountToBuy: initialOrder.amountToBuy,
                amountToBid: initialOrder.amountToBid,
            };
            expect(json(expectedPrice)).deep.eq(json(calculatedPrice));
        });
    });
});
