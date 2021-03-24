import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import hre, { ethers, waffle } from "hardhat";

import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";

import {
    toReceivedFunds,
    encodeOrder,
    queueStartElement,
    createTokensAndMintAndApprove,
    placeOrders,
    calculateClearingPrice,
    reverseOrderPrice,
} from "../../src/priceCalculation";

import {
    sendTxAndGetReturnValue,
    closeAuction,
    increaseTime,
    claimFromAllOrders,
    getCurrentTime,
} from "./utilities";

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Some tests use different test cases 1,..,10. These test cases are illustrated in the following jam board:
// https://jamboard.google.com/d/1DMgMYCQQzsSLKPq_hlK3l32JNBbRdIhsOrLB1oHaEYY/edit?usp=sharing
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe.skip("EasyAuction", async () => {
    const [user_1, user_2, user_3] = waffle.provider.getWallets();
    let easyAuction: Contract;
    beforeEach(async () => {
        const EasyAuction = await ethers.getContractFactory("EasyAuction");

        easyAuction = await EasyAuction.deploy();
    });
    describe("initAuction", async () => {
        it("throws if minimumBiddingAmountPerOrder is zero", async () => {
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await expect(
                easyAuction.initAuction(
                    tokenIn.address,
                    tokenOut.address,
                    60 * 60,
                    ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1"),
                    0,
                    0,
                    60 * 30,
                    60 * 30,
                    false
                )
            ).to.be.revertedWith(
                "minimumBiddingAmountPerOrder is not allowed to be zero"
            );
        });
        it("throws if auctioned amount is zero", async () => {
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await expect(
                easyAuction.initAuction(
                    tokenIn.address,
                    tokenOut.address,
                    60 * 60,
                    0,
                    ethers.utils.parseEther("1"),
                    1,
                    0,
                    60 * 30,
                    60 * 30,
                    false
                )
            ).to.be.revertedWith("cannot auction zero tokens");
        });
        it("throws if auction is a giveaway", async () => {
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await expect(
                easyAuction.initAuction(
                    tokenIn.address,
                    tokenOut.address,
                    60 * 60,
                    ethers.utils.parseEther("1"),
                    0,
                    1,
                    0,
                    60 * 30,
                    60 * 30,
                    false
                )
            ).to.be.revertedWith("tokens cannot be auctioned for free");
        });
        it("throws if auction periods do not make sense", async () => {
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await expect(
                easyAuction.initAuction(
                    tokenIn.address,
                    tokenOut.address,
                    60 * 60 + 1,
                    ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1"),
                    1,
                    0,
                    60 * 30,
                    60 * 30,
                    false
                )
            ).to.be.revertedWith("time periods are not configured correctly");
        });
        it("initAuction stores the parameters correctly", async () => {
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            const timestampForMining = 2000000000;
            ethers.provider.send("evm_setNextBlockTimestamp", [
                timestampForMining,
            ]);
            easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                ethers.utils.parseEther("2"),
                ethers.utils.parseEther("1"),
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            expect(await easyAuction.tokenOut()).to.equal(tokenIn.address);
            expect(await easyAuction.tokenIn()).to.equal(tokenIn.address);
            expect(await easyAuction.initialAuctionOrder()).to.equal(
                encodeOrder({
                    ownerId: BigNumber.from(1),
                    orderTokenOut: ethers.utils.parseEther("2"),
                    orderTokenIn: ethers.utils.parseEther("1"),
                })
            );
            expect(await easyAuction.endDate()).to.be.equal(0);
            expect(await easyAuction.orderCancellationEndDate()).to.be.equal(
                timestampForMining + 3600
            );
            expect(await easyAuction.auctionStartedDate()).to.be.equal(
                timestampForMining
            );
            expect(await easyAuction.gracePeriodStartDate()).to.be.equal(
                timestampForMining + 1200
            );
            expect(await easyAuction.gracePeriodEndDate()).to.be.equal(
                timestampForMining + 3600
            );
            expect(
                await easyAuction.minimumBiddingAmountPerOrder()
            ).to.be.equal(1);
            expect(await easyAuction.interimSumBidAmount()).to.be.equal(0);
            await expect(await easyAuction.clearingPriceOrder()).to.equal(
                encodeOrder({
                    ownerId: BigNumber.from(0),
                    orderTokenIn: ethers.utils.parseEther("0"),
                    orderTokenOut: ethers.utils.parseEther("0"),
                })
            );
            expect(await easyAuction.volumeClearingPriceOrder()).to.be.equal(0);

            expect(await tokenOut.balanceOf(easyAuction.address)).to.equal(
                ethers.utils.parseEther("2")
            );
        });
    });
    describe("getUserId", async () => {
        it("creates new ownerIds", async () => {
            expect(
                await sendTxAndGetReturnValue(
                    easyAuction,
                    "getUserId(address)",
                    user_1.address
                )
            ).to.equal(1);
            expect(
                await sendTxAndGetReturnValue(
                    easyAuction,
                    "getUserId(address)",
                    user_2.address
                )
            ).to.equal(2);
            expect(
                await sendTxAndGetReturnValue(
                    easyAuction,
                    "getUserId(address)",
                    user_1.address
                )
            ).to.equal(1);
        });
    });
    describe("placeOrders", async () => {
        it("one can not place orders, if auction is not yet initiated", async () => {
            await expect(
                easyAuction.placeOrders(
                    [ethers.utils.parseEther("1")],
                    [ethers.utils.parseEther("1").add(1)],
                    [queueStartElement]
                )
            ).to.be.revertedWith("no longer in order placement phase");
        });
        // it("one can not place orders, if auction is over", async () => {
        //   const {
        //     tokenIn,
        //     tokenOut,
        //   } = await createTokensAndMintAndApprove(
        //     easyAuction,
        //     [user_1, user_2],
        //     hre,
        //   );
        //   easyAuction.initAuction(
        //     tokenIn.address,
        //     tokenOut.address,
        //     60 * 60,
        //     ethers.utils.parseEther("2"),
        //     ethers.utils.parseEther("1"),
        //     1,
        //     0,
        //     60 * 20,
        //     60 * 40,
        //     false,
        //   );
        //   await closeAuction(easyAuction);
        //   await expect(
        //     easyAuction.placeOrders(
        //       [ethers.utils.parseEther("1")],
        //       [ethers.utils.parseEther("1").add(1)],
        //       [queueStartElement],
        //     ),
        //   ).to.be.revertedWith("no longer in order placement phase");
        // });
        it("one can not place orders, with a worser or same rate", async () => {
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );
            easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                ethers.utils.parseEther("2"),
                ethers.utils.parseEther("1"),
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await expect(
                easyAuction.placeOrders(
                    [ethers.utils.parseEther("2").add(1)],
                    [ethers.utils.parseEther("1")],
                    [queueStartElement]
                )
            ).to.be.revertedWith("limit price not better than mimimal offer");
            await expect(
                easyAuction.placeOrders(
                    [ethers.utils.parseEther("2")],
                    [ethers.utils.parseEther("1")],
                    [queueStartElement]
                )
            ).to.be.revertedWith("limit price not better than mimimal offer");
        });
        it("does not withdraw funds, if orders are placed twice", async () => {
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );
            easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                ethers.utils.parseEther("2"),
                ethers.utils.parseEther("1"),
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await expect(() =>
                easyAuction.placeOrders(
                    [ethers.utils.parseEther("2").sub(1)],
                    [ethers.utils.parseEther("1")],
                    [queueStartElement]
                )
            ).to.changeTokenBalances(
                tokenOut,
                [user_1],
                [ethers.utils.parseEther("-1")]
            );
            await expect(() =>
                easyAuction.placeOrders(
                    [ethers.utils.parseEther("2").sub(1)],
                    [ethers.utils.parseEther("1")],
                    [queueStartElement]
                )
            ).to.changeTokenBalances(tokenOut, [user_1], [BigNumber.from(0)]);
        });
        it("places a new order and checks that tokens were transferred", async () => {
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );
            easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                ethers.utils.parseEther("2"),
                ethers.utils.parseEther("1"),
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            const balanceBeforeOrderPlacement = await tokenIn.balanceOf(
                user_1.address
            );
            const orderTokenIn = ethers.utils.parseEther("1").add(1);
            const orderTokenOut = ethers.utils.parseEther("2");

            await easyAuction.placeOrders(
                [orderTokenOut, orderTokenOut],
                [orderTokenIn, orderTokenIn.add(1)],
                [queueStartElement, queueStartElement]
            );
            const transferredtokenInAmount = orderTokenIn.add(
                orderTokenIn.add(1)
            );

            expect(await tokenIn.balanceOf(easyAuction.address)).to.equal(
                transferredtokenInAmount
            );
            expect(await tokenIn.balanceOf(user_1.address)).to.equal(
                balanceBeforeOrderPlacement.sub(transferredtokenInAmount)
            );
        });
        it("throws, if DDOS attack with small order amounts is started", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("2"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").div(5000),
                    orderTokenOut: ethers.utils.parseEther("2").div(10000),
                    ownerId: BigNumber.from(0),
                },
            ];

            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                ethers.utils.parseEther("1").div(1000),
                0,
                60 * 20,
                60 * 40,
                false
            );
            await expect(
                easyAuction.placeOrders(
                    sellOrders.map((buyOrder) => buyOrder.orderTokenOut),
                    sellOrders.map((buyOrder) => buyOrder.orderTokenIn),
                    Array(sellOrders.length).fill(queueStartElement)
                )
            ).to.be.revertedWith("order too small");
        });
        it("fails, if transfers are failing", async () => {
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );
            easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                ethers.utils.parseEther("2"),
                ethers.utils.parseEther("1"),
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            const orderTokenIn = ethers.utils.parseEther("1").add(1);
            const orderTokenOut = ethers.utils.parseEther("1");
            await tokenIn.approve(
                easyAuction.address,
                ethers.utils.parseEther("0")
            );

            await expect(
                easyAuction.placeOrders(
                    [orderTokenOut, orderTokenOut],
                    [orderTokenIn, orderTokenIn.add(1)],
                    [queueStartElement, queueStartElement]
                )
            ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
        });
    });
    describe("precalculateSellAmountSum", async () => {
        it("fails if too many orders are considered", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2),
                    orderTokenOut: ethers.utils.parseEther("1").div(5),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2),
                    orderTokenOut: ethers.utils.parseEther("1"),
                    ownerId: BigNumber.from(1),
                },

                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2).add(1),
                    orderTokenOut: ethers.utils.parseEther("1").mul(2),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);
            await closeAuction(easyAuction);
            await expect(
                easyAuction.precalculateSellAmountSum(3)
            ).to.be.revertedWith("too many orders summed up");
        });
        it("fails if queue end is reached", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2),
                    orderTokenOut: ethers.utils.parseEther("1").div(5),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await closeAuction(easyAuction);
            await expect(
                easyAuction.precalculateSellAmountSum(2)
            ).to.be.revertedWith("reached end of order list");
        });
        it("verifies that interimSumBidAmount and iterOrder is set correctly", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2),
                    orderTokenOut: ethers.utils.parseEther("1").div(5),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2),
                    orderTokenOut: ethers.utils.parseEther("1"),
                    ownerId: BigNumber.from(2),
                },

                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2).add(1),
                    orderTokenOut: ethers.utils.parseEther("1").mul(2),
                    ownerId: BigNumber.from(2),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );
            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);
            await closeAuction(easyAuction);

            await easyAuction.precalculateSellAmountSum(1);
            expect(await easyAuction.interimSumBidAmount()).to.equal(
                sellOrders[0].orderTokenIn
            );

            expect(await easyAuction.interimOrder()).to.equal(
                encodeOrder(sellOrders[0])
            );
        });
        it("verifies that interimSumBidAmount and iterOrder takes correct starting values by applying twice", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1"),
                    orderTokenOut: ethers.utils.parseEther("1").div(10),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("1"),
                    orderTokenOut: ethers.utils.parseEther("1").div(10),
                    ownerId: BigNumber.from(2),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2),
                    orderTokenOut: ethers.utils.parseEther("1"),
                    ownerId: BigNumber.from(1),
                },

                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2).add(1),
                    orderTokenOut: ethers.utils.parseEther("1").mul(2),
                    ownerId: BigNumber.from(2),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);
            await closeAuction(easyAuction);

            await easyAuction.precalculateSellAmountSum(1);
            await easyAuction.precalculateSellAmountSum(1);
            expect(await easyAuction.interimSumBidAmount()).to.equal(
                sellOrders[0].orderTokenIn.add(sellOrders[0].orderTokenIn)
            );

            expect(await easyAuction.interimOrder()).to.equal(
                encodeOrder(sellOrders[1])
            );
        });
    });
    describe("settleAuction", async () => {
        it("checks case 4, it verifies the price in case of clearingOrder == initialAuctionOrder", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("5"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("0.1"),
                    orderTokenOut: ethers.utils.parseEther("0.1"),
                    ownerId: BigNumber.from(1),
                },
            ];

            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );

            await placeOrders(easyAuction, sellOrders, hre);

            await increaseTime(3601);
            await easyAuction.setAuctionEndDate((await getCurrentTime()) - 10);

            await easyAuction.settleAuction();

            expect(await easyAuction.clearingPriceOrder()).to.equal(
                encodeOrder(initialAuctionOrder)
            );
            expect(await easyAuction.volumeClearingPriceOrder()).to.equal(0);
            await claimFromAllOrders(easyAuction, sellOrders);
        });
        it("checks case 4, it verifies the price in case of clearingOrder == initialAuctionOrder with 3 orders", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("2"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("0.1"),
                    orderTokenOut: ethers.utils.parseEther("0.1"),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("0.1"),
                    orderTokenOut: ethers.utils.parseEther("0.1"),
                    ownerId: BigNumber.from(2),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("0.1"),
                    orderTokenOut: ethers.utils.parseEther("0.1"),
                    ownerId: BigNumber.from(3),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2, user_3],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );

            await placeOrders(easyAuction, sellOrders, hre);

            await increaseTime(3601);
            await easyAuction.setAuctionEndDate((await getCurrentTime()) - 10);

            await easyAuction.settleAuction();

            expect(await easyAuction.clearingPriceOrder()).to.equal(
                encodeOrder(initialAuctionOrder)
            );
            expect(await easyAuction.volumeClearingPriceOrder()).to.equal(0);
            await claimFromAllOrders(easyAuction, sellOrders);
        });
        it("checks case 6, it verifies the price in case of clearingOrder == initialAuctionOrder, although last iterOrder would also be possible", async () => {
            // This test demonstrates the case 6,
            // where price could be either the auctioningOrder or sellOrder
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("500"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("0.2"),
                    orderTokenOut: ethers.utils.parseEther("50"),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );

            await placeOrders(easyAuction, sellOrders, hre);

            await increaseTime(3601);
            await easyAuction.setAuctionEndDate((await getCurrentTime()) - 10);
            await easyAuction.settleAuction();

            expect(await easyAuction.clearingPriceOrder()).to.equal(
                encodeOrder(initialAuctionOrder)
            );
            expect(await easyAuction.volumeClearingPriceOrder()).to.equal(0);
            await easyAuction.claimFromParticipantOrder(
                sellOrders.map((order) => encodeOrder(order))
            );
        });
        it("checks case 3, it verifies the price in case of clearingOrder != placed order with 3x participation", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("500"),
                ownerId: BigNumber.from(1),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1"),
                    orderTokenOut: ethers.utils.parseEther("1"),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("1"),
                    orderTokenOut: ethers.utils.parseEther("1"),
                    ownerId: BigNumber.from(3),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("1"),
                    orderTokenOut: ethers.utils.parseEther("1"),
                    ownerId: BigNumber.from(2),
                },
            ];

            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2, user_3],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );

            await placeOrders(easyAuction, sellOrders, hre);

            await increaseTime(3601);
            await easyAuction.setAuctionEndDate((await getCurrentTime()) - 10);
            await easyAuction.settleAuction();

            expect(await easyAuction.clearingPriceOrder()).to.equal(
                encodeOrder({
                    orderTokenIn: ethers.utils.parseEther("3"),
                    orderTokenOut: initialAuctionOrder.orderTokenOut,
                    ownerId: BigNumber.from(0),
                })
            );
            expect(await easyAuction.volumeClearingPriceOrder()).to.equal(0);
            await claimFromAllOrders(easyAuction, sellOrders);
        });
        it("checks case 8, it verifies the price in case of no participation of the auction", async () => {
            const initialAuctionOrder = {
                orderTokenIn: BigNumber.from(1000),
                orderTokenOut: BigNumber.from(1000),
                ownerId: BigNumber.from(0),
            };

            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );

            await increaseTime(3601);
            await easyAuction.setAuctionEndDate((await getCurrentTime()) - 10);
            await easyAuction.settleAuction();

            expect(await easyAuction.clearingPriceOrder()).to.equal(
                encodeOrder(initialAuctionOrder)
            );
            expect(await easyAuction.volumeClearingPriceOrder()).to.equal(
                BigNumber.from(0)
            );
        });
        it("checks case 2, it verifies the price in case without a partially filled order", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2),
                    orderTokenOut: ethers.utils.parseEther("1").div(2),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("1").add(1),
                    orderTokenOut: ethers.utils.parseEther("1"),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await increaseTime(3601);
            await easyAuction.setAuctionEndDate((await getCurrentTime()) - 10);
            await easyAuction.settleAuction();
            expect(await easyAuction.clearingPriceOrder()).to.equal(
                encodeOrder({
                    orderTokenIn: sellOrders[0].orderTokenIn,
                    orderTokenOut: initialAuctionOrder.orderTokenOut,
                    ownerId: BigNumber.from(0),
                })
            );
            expect(await easyAuction.volumeClearingPriceOrder()).to.equal(0);
            await claimFromAllOrders(easyAuction, sellOrders);
        });
        it("checks case 10, verifies the price in case one order is eating initialAuctionOrder completely", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("2"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(20),
                    orderTokenOut: ethers.utils.parseEther("2").mul(10),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await increaseTime(3601);
            await easyAuction.setAuctionEndDate((await getCurrentTime()) - 10);
            await easyAuction.settleAuction();

            expect(await easyAuction.clearingPriceOrder()).to.equal(
                encodeOrder(sellOrders[0])
            );
            expect(await easyAuction.volumeClearingPriceOrder()).to.equal(
                initialAuctionOrder.orderTokenOut
                    .mul(sellOrders[0].orderTokenIn)
                    .div(sellOrders[0].orderTokenOut)
            );
            await claimFromAllOrders(easyAuction, sellOrders);
        });
        it("checks case 5, bidding amount matches min orderTokenIn of initialOrder perfectly", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("0.5"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("0.5"),
                    orderTokenOut: ethers.utils.parseEther("0.5"),
                    ownerId: BigNumber.from(2),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("0.5"),
                    orderTokenOut: ethers.utils.parseEther("0.5"),
                    ownerId: BigNumber.from(3),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2, user_3],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await increaseTime(3601);
            await easyAuction.setAuctionEndDate((await getCurrentTime()) - 10);
            await easyAuction.settleAuction();

            expect(await easyAuction.clearingPriceOrder()).to.eql(
                encodeOrder(sellOrders[1])
            );
            expect(await easyAuction.volumeClearingPriceOrder()).to.equal(
                sellOrders[1].orderTokenIn
            );
            await expect(() =>
                easyAuction.claimFromParticipantOrder([
                    encodeOrder(sellOrders[0]),
                ])
            ).to.changeTokenBalances(
                tokenIn,
                [user_2],
                [sellOrders[0].orderTokenIn]
            );
            await expect(() =>
                easyAuction.claimFromParticipantOrder([
                    encodeOrder(sellOrders[1]),
                ])
            ).to.changeTokenBalances(
                tokenIn,
                [user_3],
                [sellOrders[1].orderTokenIn]
            );
        });
        it("checks case 7, bidding amount matches min orderTokenIn of initialOrder perfectly with additional order", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("0.5"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("0.5"),
                    orderTokenOut: ethers.utils.parseEther("0.5"),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("0.5"),
                    orderTokenOut: ethers.utils.parseEther("0.5"),
                    ownerId: BigNumber.from(2),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("0.5"),
                    orderTokenOut: ethers.utils.parseEther("0.6"),
                    ownerId: BigNumber.from(3),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2, user_3],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );

            await placeOrders(easyAuction, sellOrders, hre);

            await increaseTime(3601);
            await easyAuction.setAuctionEndDate((await getCurrentTime()) - 10);
            await easyAuction.settleAuction();

            expect(await easyAuction.clearingPriceOrder()).to.eql(
                encodeOrder(sellOrders[1])
            );
            expect(await easyAuction.volumeClearingPriceOrder()).to.equal(
                sellOrders[1].orderTokenIn
            );
            await expect(() =>
                easyAuction.claimFromParticipantOrder([
                    encodeOrder(sellOrders[0]),
                ])
            ).to.changeTokenBalances(
                tokenIn,
                [user_1],
                [sellOrders[0].orderTokenOut]
            );
            await expect(() =>
                easyAuction.claimFromParticipantOrder([
                    encodeOrder(sellOrders[1]),
                ])
            ).to.changeTokenBalances(
                tokenIn,
                [user_2],
                [sellOrders[1].orderTokenOut]
            );
            await expect(() =>
                easyAuction.claimFromParticipantOrder([
                    encodeOrder(sellOrders[2]),
                ])
            ).to.changeTokenBalances(
                tokenOut,
                [user_3],
                [sellOrders[2].orderTokenIn]
            );
        });
        it("checks case 10, it shows an example why ownerId should always be given: 2 orders with the same price", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("0.5"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("0.5"),
                    orderTokenOut: ethers.utils.parseEther("0.5"),
                    ownerId: BigNumber.from(2),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("0.5"),
                    orderTokenOut: ethers.utils.parseEther("0.5"),
                    ownerId: BigNumber.from(3),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("0.5"),
                    orderTokenOut: ethers.utils.parseEther("0.4"),
                    ownerId: BigNumber.from(3),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2, user_3],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await increaseTime(3601);
            await easyAuction.setAuctionEndDate((await getCurrentTime()) - 10);
            await easyAuction.settleAuction();

            expect(await easyAuction.clearingPriceOrder()).to.equal(
                encodeOrder(sellOrders[0])
            );
            expect(await easyAuction.volumeClearingPriceOrder()).to.equal(
                sellOrders[1].orderTokenIn
            );
            await expect(() =>
                easyAuction.claimFromParticipantOrder([
                    encodeOrder(sellOrders[0]),
                ])
            ).to.changeTokenBalances(
                tokenIn,
                [user_2],
                [sellOrders[0].orderTokenIn]
            );
            await expect(() =>
                easyAuction.claimFromParticipantOrder([
                    encodeOrder(sellOrders[1]),
                ])
            ).to.changeTokenBalances(
                tokenOut,
                [user_3],
                [sellOrders[1].orderTokenIn]
            );
            await expect(() =>
                easyAuction.claimFromParticipantOrder([
                    encodeOrder(sellOrders[2]),
                ])
            ).to.changeTokenBalances(
                tokenIn,
                [user_3],
                [sellOrders[2].orderTokenIn]
            );
        });
        it("checks case 1, it verifies the price in case of 2 of 3 sellOrders eating initialAuctionOrder completely", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2),
                    orderTokenOut: ethers.utils.parseEther("1").div(5),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2),
                    orderTokenOut: ethers.utils.parseEther("1"),
                    ownerId: BigNumber.from(1),
                },

                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2).add(1),
                    orderTokenOut: ethers.utils.parseEther("1").mul(2),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await increaseTime(3601);
            await easyAuction.setAuctionEndDate((await getCurrentTime()) - 10);
            await easyAuction.settleAuction();

            expect(await easyAuction.clearingPriceOrder()).to.eql(
                encodeOrder(sellOrders[1])
            );
            expect(await easyAuction.volumeClearingPriceOrder()).to.equal(0);
            await claimFromAllOrders(easyAuction, sellOrders);
        });
        it("verifies the price in case of 2 of 3 sellOrders eating initialAuctionOrder completely - with precalculateSellAmountSum step", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2),
                    orderTokenOut: ethers.utils.parseEther("1").div(5),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2),
                    orderTokenOut: ethers.utils.parseEther("1"),
                    ownerId: BigNumber.from(1),
                },

                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2).add(1),
                    orderTokenOut: ethers.utils.parseEther("1").mul(2),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await increaseTime(3601);
            await easyAuction.setAuctionEndDate((await getCurrentTime()) - 10);
            // this is the additional step
            await easyAuction.precalculateSellAmountSum(1);

            await easyAuction.settleAuction();

            expect(await easyAuction.clearingPriceOrder()).to.eql(
                encodeOrder(sellOrders[1])
            );
            expect(await easyAuction.volumeClearingPriceOrder()).to.equal(0);
        });
        it("verifies the price in case of 2 of 4 sellOrders eating initialAuctionOrder completely - with precalculateSellAmountSum step and one more step within settleAuction", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1"),
                    orderTokenOut: ethers.utils.parseEther("1").div(5),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("1"),
                    orderTokenOut: ethers.utils.parseEther("1").div(5),
                    ownerId: BigNumber.from(2),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2),
                    orderTokenOut: ethers.utils.parseEther("1"),
                    ownerId: BigNumber.from(1),
                },

                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2).add(1),
                    orderTokenOut: ethers.utils.parseEther("1").mul(2),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await increaseTime(3601);
            await easyAuction.setAuctionEndDate((await getCurrentTime()) - 10);
            // this is the additional step
            await easyAuction.precalculateSellAmountSum(1);

            expect(await easyAuction.interimSumBidAmount()).to.equal(
                sellOrders[0].orderTokenIn
            );
            expect(await easyAuction.interimOrder()).to.equal(
                encodeOrder(sellOrders[0])
            );
            await easyAuction.settleAuction();

            expect(await easyAuction.clearingPriceOrder()).to.eql(
                encodeOrder(sellOrders[2])
            );
            expect(await easyAuction.volumeClearingPriceOrder()).to.equal(0);
            await claimFromAllOrders(easyAuction, sellOrders);
        });
        it("verifies the price in case of clearing order is decided by ownerId", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2),
                    orderTokenOut: ethers.utils.parseEther("1").div(5),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2),
                    orderTokenOut: ethers.utils.parseEther("1"),
                    ownerId: BigNumber.from(1),
                },

                {
                    orderTokenIn: ethers.utils.parseEther("1").mul(2),
                    orderTokenOut: ethers.utils.parseEther("1"),
                    ownerId: BigNumber.from(2),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await increaseTime(3601);
            await easyAuction.setAuctionEndDate((await getCurrentTime()) - 10);
            await easyAuction.settleAuction();

            expect(await easyAuction.clearingPriceOrder()).to.be.equal(
                encodeOrder(sellOrders[1])
            );
            expect(await easyAuction.volumeClearingPriceOrder()).to.equal(0);
            await claimFromAllOrders(easyAuction, sellOrders);
        });
        it("simple version of e2e gas test", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").div(4),
                    orderTokenOut: ethers.utils.parseEther("1").div(8),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("1").div(4),
                    orderTokenOut: ethers.utils.parseEther("1").div(12),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("1").div(4),
                    orderTokenOut: ethers.utils.parseEther("1").div(16),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("1").div(4),
                    orderTokenOut: ethers.utils.parseEther("1").div(20),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await increaseTime(3601);
            await easyAuction.setAuctionEndDate((await getCurrentTime()) - 10);
            const price = await calculateClearingPrice(easyAuction);

            await easyAuction.settleAuction();
            expect(price).to.eql(initialAuctionOrder);

            expect(await easyAuction.clearingPriceOrder()).to.equal(
                encodeOrder(reverseOrderPrice(initialAuctionOrder))
            );
            expect(await easyAuction.volumeClearingPriceOrder()).to.equal(0);
            await claimFromAllOrders(easyAuction, sellOrders);
        });
        it("checks whether the minimalFundingThreshold is not met", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("10"),
                orderTokenOut: ethers.utils.parseEther("10"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1"),
                    orderTokenOut: ethers.utils.parseEther("1").div(2),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("1"),
                    orderTokenOut: ethers.utils.parseEther("1").div(4),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                ethers.utils.parseEther("5"),
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await increaseTime(3601);
            await easyAuction.setAuctionEndDate((await getCurrentTime()) - 10);
            const price = await calculateClearingPrice(easyAuction);

            await easyAuction.settleAuction();
            expect(price).to.eql(initialAuctionOrder);

            expect(await easyAuction.minSellThresholdNotReached()).to.equal(
                true
            );
        });
    });
    describe("claimFromAuctioneerOrder", async () => {
        it("checks that auctioneer receives all their tokenOuts back if minSellThreshold was not met", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("10"),
                orderTokenOut: ethers.utils.parseEther("10"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1"),
                    orderTokenOut: ethers.utils.parseEther("1").div(2),
                    ownerId: BigNumber.from(2),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("1"),
                    orderTokenOut: ethers.utils.parseEther("1").div(4),
                    ownerId: BigNumber.from(3),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2, user_3],
                hre
            );
            const tokenOutBalanceBeforeAuction = await tokenOut.balanceOf(
                user_1.address
            );
            //const feeReceiver = user_3;
            //const feeNumerator = 10;
            // await easyAuction
            //   .connect(user_1)
            //   .setFeeParameters(feeNumerator, feeReceiver.address);
            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                ethers.utils.parseEther("5"),
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);
            await closeAuction(easyAuction);
            await easyAuction.settleAuction();

            expect(await easyAuction.minSellThresholdNotReached()).to.equal(
                true
            );
            expect(await tokenOut.balanceOf(user_1.address)).to.be.equal(
                tokenOutBalanceBeforeAuction
            );
        });
        it("checks the claimed amounts for a fully matched initialAuctionOrder and buyOrder", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").add(1),
                    orderTokenOut: ethers.utils.parseEther("1"),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );
            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);
            await closeAuction(easyAuction);
            const price = await calculateClearingPrice(easyAuction);
            const callPromise = easyAuction.settleAuction();
            // auctioneer reward check:
            await expect(() => callPromise).to.changeTokenBalances(
                tokenIn,
                [user_1],
                [0]
            );
            await expect(callPromise)
                .to.emit(tokenIn, "Transfer")
                .withArgs(
                    easyAuction.address,
                    user_1.address,
                    price.orderTokenIn
                );
        });
        it("checks the claimed amounts for a partially matched initialAuctionOrder and buyOrder", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").div(2).add(1),
                    orderTokenOut: ethers.utils.parseEther("1").div(2),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);
            await closeAuction(easyAuction);
            const callPromise = easyAuction.settleAuction();
            // auctioneer reward check:
            await expect(callPromise)
                .to.emit(tokenOut, "Transfer")
                .withArgs(
                    easyAuction.address,
                    user_1.address,
                    initialAuctionOrder.orderTokenIn.sub(
                        sellOrders[0].orderTokenIn
                    )
                );
            await expect(callPromise)
                .to.emit(tokenIn, "Transfer")
                .withArgs(
                    easyAuction.address,
                    user_1.address,
                    sellOrders[0].orderTokenIn
                );
        });
    });
    describe("claimFromParticipantOrder", async () => {
        it("checks that participant receives all their tokenIns back if minSellThreshold was not met", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("10"),
                orderTokenOut: ethers.utils.parseEther("10"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1"),
                    orderTokenOut: ethers.utils.parseEther("1").div(2),
                    ownerId: BigNumber.from(2),
                },
                {
                    orderTokenIn: ethers.utils.parseEther("1"),
                    orderTokenOut: ethers.utils.parseEther("1").div(4),
                    ownerId: BigNumber.from(2),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                ethers.utils.parseEther("5"),
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);
            await closeAuction(easyAuction);
            await easyAuction.settleAuction();
            await expect(() =>
                easyAuction.claimFromParticipantOrder(
                    sellOrders.map((order) => encodeOrder(order))
                )
            ).to.changeTokenBalances(
                tokenOut,
                [user_2],
                [sellOrders[0].orderTokenIn.add(sellOrders[1].orderTokenIn)]
            );
        });
        it("checks that claiming only works after the finishing of the auction", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").add(1),
                    orderTokenOut: ethers.utils.parseEther("1"),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await expect(
                easyAuction.claimFromParticipantOrder(
                    sellOrders.map((order) => encodeOrder(order))
                )
            ).to.be.revertedWith("Auction not yet finished");
            await closeAuction(easyAuction);
            await expect(
                easyAuction.claimFromParticipantOrder(
                    sellOrders.map((order) => encodeOrder(order))
                )
            ).to.be.revertedWith("Auction not yet finished");
        });
        it("checks the claimed amounts for a partially matched buyOrder", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").div(2).add(1),
                    orderTokenOut: ethers.utils.parseEther("1").div(2),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils
                        .parseEther("1")
                        .mul(2)
                        .div(3)
                        .add(1),
                    orderTokenOut: ethers.utils.parseEther("1").mul(2).div(3),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);
            await closeAuction(easyAuction);
            const price = await calculateClearingPrice(easyAuction);
            await easyAuction.settleAuction();

            const receivedAmounts = toReceivedFunds(
                await easyAuction.callStatic.claimFromParticipantOrder([
                    encodeOrder(sellOrders[1]),
                ])
            );
            const settledBuyAmount = sellOrders[1].orderTokenIn
                .mul(price.orderTokenOut)
                .div(price.orderTokenIn)
                .sub(
                    sellOrders[0].orderTokenIn
                        .add(sellOrders[1].orderTokenIn)
                        .mul(price.orderTokenOut)
                        .div(price.orderTokenIn)
                        .sub(initialAuctionOrder.orderTokenIn)
                )
                .sub(1);
            expect(receivedAmounts.tokenOutAmount).to.equal(settledBuyAmount);
            expect(receivedAmounts.tokenInAmount).to.equal(
                sellOrders[1].orderTokenIn
                    .sub(
                        settledBuyAmount
                            .mul(price.orderTokenIn)
                            .div(price.orderTokenOut)
                    )
                    .sub(1)
            );
        });
        it("checks the claimed amounts for a fully not-matched buyOrder", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").div(2).add(1),
                    orderTokenOut: ethers.utils.parseEther("1").div(2),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils
                        .parseEther("1")
                        .mul(2)
                        .div(3)
                        .add(1),
                    orderTokenOut: ethers.utils.parseEther("1").mul(2).div(3),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils
                        .parseEther("1")
                        .mul(2)
                        .div(3)
                        .add(1),
                    orderTokenOut: ethers.utils.parseEther("1").mul(2).div(3),
                    ownerId: BigNumber.from(2),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);
            await closeAuction(easyAuction);
            await easyAuction.settleAuction();
            const receivedAmounts = toReceivedFunds(
                await easyAuction.callStatic.claimFromParticipantOrder([
                    encodeOrder(sellOrders[2]),
                ])
            );
            expect(receivedAmounts.tokenInAmount).to.equal(
                sellOrders[2].orderTokenIn
            );
            expect(receivedAmounts.tokenOutAmount).to.equal("0");
        });
        it("checks the claimed amounts for a fully matched buyOrder", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").div(2).add(1),
                    orderTokenOut: ethers.utils.parseEther("1").div(2),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils
                        .parseEther("1")
                        .mul(2)
                        .div(3)
                        .add(1),
                    orderTokenOut: ethers.utils.parseEther("1").mul(2).div(3),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);
            await closeAuction(easyAuction);
            const price = await calculateClearingPrice(easyAuction);
            await easyAuction.settleAuction();

            const receivedAmounts = toReceivedFunds(
                await easyAuction.callStatic.claimFromParticipantOrder([
                    encodeOrder(sellOrders[0]),
                ])
            );
            expect(receivedAmounts.tokenInAmount).to.equal("0");
            expect(receivedAmounts.tokenOutAmount).to.equal(
                sellOrders[0].orderTokenIn
                    .mul(price.orderTokenOut)
                    .div(price.orderTokenIn)
            );
        });
        it("checks that an order can not be used for claiming twice", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").div(2).add(1),
                    orderTokenOut: ethers.utils.parseEther("1").div(2),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils
                        .parseEther("1")
                        .mul(2)
                        .div(3)
                        .add(1),
                    orderTokenOut: ethers.utils.parseEther("1").mul(2).div(3),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);
            await closeAuction(easyAuction);
            await easyAuction.settleAuction();
            await easyAuction.claimFromParticipantOrder([
                encodeOrder(sellOrders[0]),
            ]),
                await expect(
                    easyAuction.claimFromParticipantOrder([
                        encodeOrder(sellOrders[0]),
                    ])
                ).to.be.revertedWith("order is no longer claimable");
        });
    });
    describe("checks that orders from different users can not be claimed at once", async () => {
        it("checks that orders from different users can not be claimed at once", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").div(2).add(1),
                    orderTokenOut: ethers.utils.parseEther("1").div(2),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils
                        .parseEther("1")
                        .mul(2)
                        .div(3)
                        .add(1),
                    orderTokenOut: ethers.utils.parseEther("1").mul(2).div(3),
                    ownerId: BigNumber.from(2),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);
            await closeAuction(easyAuction);
            await easyAuction.settleAuction();
            await expect(
                easyAuction.claimFromParticipantOrder([
                    encodeOrder(sellOrders[0]),
                    encodeOrder(sellOrders[1]),
                ])
            ).to.be.revertedWith("only allowed to claim for same user");
        });
    });
    describe("checks the claimed amounts are summed up correctly for two orders", async () => {
        it("checks the claimed amounts are summed up correctly for two orders", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").div(2).add(1),
                    orderTokenOut: ethers.utils.parseEther("1").div(2),
                    ownerId: BigNumber.from(1),
                },
                {
                    orderTokenIn: ethers.utils
                        .parseEther("1")
                        .mul(2)
                        .div(3)
                        .add(1),
                    orderTokenOut: ethers.utils.parseEther("1").mul(2).div(3),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await closeAuction(easyAuction);
            const price = await calculateClearingPrice(easyAuction);
            await easyAuction.settleAuction();

            const receivedAmounts = toReceivedFunds(
                await easyAuction.callStatic.claimFromParticipantOrder([
                    encodeOrder(sellOrders[0]),
                    encodeOrder(sellOrders[1]),
                ])
            );
            expect(receivedAmounts.tokenInAmount).to.equal(
                sellOrders[0].orderTokenIn
                    .add(sellOrders[1].orderTokenIn)
                    .sub(
                        initialAuctionOrder.orderTokenIn
                            .mul(price.orderTokenIn)
                            .div(price.orderTokenOut)
                    )
            );
            expect(receivedAmounts.tokenOutAmount).to.equal(
                initialAuctionOrder.orderTokenIn.sub(1)
            );
        });
    });
    describe("settleAuctionAtomically", async () => {
        it("can not settle atomically, if it is not allowed", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("0.5"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("0.5"),
                    orderTokenOut: ethers.utils.parseEther("0.5"),
                    ownerId: BigNumber.from(1),
                },
            ];
            const atomicSellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("0.499"),
                    orderTokenOut: ethers.utils.parseEther("0.4999"),
                    ownerId: BigNumber.from(2),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await closeAuction(easyAuction);
            await expect(
                easyAuction.settleAuctionAtomically(
                    [atomicSellOrders[0].orderTokenIn],
                    [atomicSellOrders[0].orderTokenOut],
                    [queueStartElement]
                )
            ).to.be.revertedWith("not allowed to settle auction atomically");
        });
        it("can settle atomically, if it is allowed", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("0.5"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("0.5"),
                    orderTokenOut: ethers.utils.parseEther("0.5"),
                    ownerId: BigNumber.from(1),
                },
            ];
            const atomicSellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("0.4999"),
                    orderTokenOut: ethers.utils.parseEther("0.4999"),
                    ownerId: BigNumber.from(2),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                true
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await closeAuction(easyAuction);
            await easyAuction
                .connect(user_2)
                .settleAuctionAtomically(
                    [atomicSellOrders[0].orderTokenOut],
                    [atomicSellOrders[0].orderTokenIn],
                    [queueStartElement]
                );
            expect(await easyAuction.clearingPriceOrder()).to.equal(
                encodeOrder({
                    orderTokenIn: sellOrders[0].orderTokenIn.add(
                        atomicSellOrders[0].orderTokenIn
                    ),
                    orderTokenOut: initialAuctionOrder.orderTokenOut,
                    ownerId: BigNumber.from(0),
                })
            );
        });
        it("can not settle auctions atomically, before auction finished", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("0.5"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("0.5"),
                    orderTokenOut: ethers.utils.parseEther("0.5"),
                    ownerId: BigNumber.from(1),
                },
            ];
            const atomicSellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("0.4999"),
                    orderTokenOut: ethers.utils.parseEther("0.4999"),
                    ownerId: BigNumber.from(2),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await expect(
                easyAuction
                    .connect(user_2)
                    .settleAuctionAtomically(
                        [atomicSellOrders[0].orderTokenIn],
                        [atomicSellOrders[0].orderTokenOut],
                        [queueStartElement]
                    )
            ).to.be.revertedWith("Auction not in solution submission phase");
        });
    });
    describe("registerUser", async () => {
        it("registers a user only once", async () => {
            await easyAuction.registerUser(user_1.address);
            await expect(
                easyAuction.registerUser(user_1.address)
            ).to.be.revertedWith("User already registered");
        });
    });
    describe("cancelOrder", async () => {
        it("cancels an order", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").div(2).add(1),
                    orderTokenOut: ethers.utils.parseEther("1").div(2),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await expect(easyAuction.cancelOrders([encodeOrder(sellOrders[0])]))
                .to.emit(tokenIn, "Transfer")
                .withArgs(
                    easyAuction.address,
                    user_1.address,
                    sellOrders[0].orderTokenIn
                );
        });
        it("does not allow to cancel a order, if it is too late", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").div(2).add(1),
                    orderTokenOut: ethers.utils.parseEther("1").div(2),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await increaseTime(3601);
            await expect(
                easyAuction.cancelOrders([encodeOrder(sellOrders[0])])
            ).to.be.revertedWith(
                "revert no longer in order placement and cancelation phase"
            );
            await increaseTime(3601);
            await expect(
                easyAuction.cancelOrders([encodeOrder(sellOrders[0])])
            ).to.be.revertedWith(
                "revert no longer in order placement and cancelation phase"
            );
        });
        it("can't cancel orders twice", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").div(2).add(1),
                    orderTokenOut: ethers.utils.parseEther("1").div(2),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            // removes the order
            easyAuction.cancelOrders([encodeOrder(sellOrders[0])]);
            // claims 0 orderTokenIn tokens
            await expect(easyAuction.cancelOrders([encodeOrder(sellOrders[0])]))
                .to.emit(tokenIn, "Transfer")
                .withArgs(easyAuction.address, user_1.address, 0);
        });
        it("prevents an order from canceling, if tx is not from owner", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").div(2).add(1),
                    orderTokenOut: ethers.utils.parseEther("1").div(2),
                    ownerId: BigNumber.from(2),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await expect(
                easyAuction.cancelOrders([encodeOrder(sellOrders[0])])
            ).to.be.revertedWith("Only the user can cancel his orders");
        });
    });
    describe("containsOrder", async () => {
        it("returns true, if it contains order", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const sellOrders = [
                {
                    orderTokenIn: ethers.utils.parseEther("1").div(2).add(1),
                    orderTokenOut: ethers.utils.parseEther("1").div(2),
                    ownerId: BigNumber.from(1),
                },
            ];
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await placeOrders(easyAuction, sellOrders, hre);

            await closeAuction(easyAuction);
            expect(
                await easyAuction.callStatic.containsOrder(
                    encodeOrder(sellOrders[0])
                )
            ).to.be.equal(true);
        });
    });
    describe("getSecondsRemainingInBatch", async () => {
        it("checks that claiming only works after the finishing of the auction", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await closeAuction(easyAuction);
            expect(
                await easyAuction.callStatic.getSecondsRemainingInBatch()
            ).to.be.equal("0");
        });
    });
    describe("setAuctionEndDate", async () => {
        it("canot set endDate before gracePeriodEndDate", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await expect(
                easyAuction.setAuctionEndDate((await getCurrentTime()) - 10)
            ).to.be.revertedWith(
                "cannot set endDate before gracePeriodEndDate"
            );
        });
        it("canot set endDate out of grace period", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            const currentTime = await getCurrentTime();
            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await increaseTime(3601);
            await expect(
                easyAuction.setAuctionEndDate(currentTime)
            ).to.be.revertedWith("endDate must be between grace period");
            await expect(
                easyAuction.setAuctionEndDate((await getCurrentTime()) + 10)
            ).to.be.revertedWith("endDate must be between grace period");
        });
        it("set endDate after grace period ends", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await increaseTime(3601);
            const endDate = (await getCurrentTime()) - 10;
            await easyAuction.setAuctionEndDate(endDate);
            expect(await easyAuction.endDate()).to.equal(endDate);
        });
        it("can not set auction endDate twice", async () => {
            const initialAuctionOrder = {
                orderTokenIn: ethers.utils.parseEther("1"),
                orderTokenOut: ethers.utils.parseEther("1"),
                ownerId: BigNumber.from(0),
            };
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                easyAuction,
                [user_1, user_2],
                hre
            );

            await easyAuction.initAuction(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                1,
                0,
                60 * 20,
                60 * 40,
                false
            );
            await increaseTime(3601);
            const endDate = (await getCurrentTime()) - 10;
            await easyAuction.setAuctionEndDate(endDate);
            await expect(
                easyAuction.setAuctionEndDate((await getCurrentTime()) - 5)
            ).to.be.revertedWith("auction end date already set");
        });
    });
    // describe("claimsFee", async () => {
    //   it("claims fees fully for a non-partially filled initialAuctionOrder", async () => {
    //     const initialAuctionOrder = {
    //       orderTokenIn: ethers.utils.parseEther("1"),
    //       orderTokenOut: ethers.utils.parseEther("1"),
    //       ownerId: BigNumber.from(0),
    //     };
    //     let sellOrders = [
    //       {
    //         orderTokenIn: ethers.utils.parseEther("1").div(2).add(1),
    //         orderTokenOut: ethers.utils.parseEther("1").div(2),
    //         ownerId: BigNumber.from(1),
    //       },
    //       {
    //         orderTokenIn: ethers.utils.parseEther("1").mul(2).div(3).add(1),
    //         orderTokenOut: ethers.utils.parseEther("1").mul(2).div(3),
    //         ownerId: BigNumber.from(1),
    //       },
    //     ];
    //     const {
    //       tokenIn,
    //       tokenOut,
    //     } = await createTokensAndMintAndApprove(
    //       easyAuction,
    //       [user_1, user_2, user_3],
    //       hre,
    //     );

    //     const feeReceiver = user_3;
    //     const feeNumerator = 10;
    //     await easyAuction
    //       .connect(user_1)
    //       .setFeeParameters(feeNumerator, feeReceiver.address);

    //     await sendTxAndGetReturnValue(
    //       easyAuction,
    //       "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
    //       tokenIn.address,
    //       tokenOut.address,
    //       60 * 60,
    //       60 * 60,
    //       initialAuctionOrder.orderTokenIn,
    //       initialAuctionOrder.orderTokenOut,
    //       1,
    //       0,
    //       false,
    //     );
    //     await placeOrders(easyAuction, sellOrders, hre);
    //     // resets the ownerId, as they are only given during function call.
    //     sellOrders = await getAllSellOrders(easyAuction);

    //     await increaseTime(3601);
    //     await expect(() =>
    //       easyAuction.settleAuction(),
    //     ).to.changeTokenBalances(
    //       tokenIn,
    //       [feeReceiver],
    //       [initialAuctionOrder.orderTokenIn.mul(feeNumerator).div("1000")],
    //     );

    //     // contract still holds sufficient funds to pay the participants fully
    //     await easyAuction.callStatic.claimFromParticipantOrder(
    //       sellOrders.map((order) => encodeOrder(order)),
    //     );
    //   });
    //   it("claims also fee amount of zero, even when it is changed later", async () => {
    //     const initialAuctionOrder = {
    //       orderTokenIn: ethers.utils.parseEther("1"),
    //       orderTokenOut: ethers.utils.parseEther("1"),
    //       ownerId: BigNumber.from(0),
    //     };
    //     let sellOrders = [
    //       {
    //         orderTokenIn: ethers.utils.parseEther("1").div(2).add(1),
    //         orderTokenOut: ethers.utils.parseEther("1").div(2),
    //         ownerId: BigNumber.from(1),
    //       },
    //       {
    //         orderTokenIn: ethers.utils.parseEther("1").mul(2).div(3).add(1),
    //         orderTokenOut: ethers.utils.parseEther("1").mul(2).div(3),
    //         ownerId: BigNumber.from(1),
    //       },
    //     ];
    //     const {
    //       tokenIn,
    //       tokenOut,
    //     } = await createTokensAndMintAndApprove(
    //       easyAuction,
    //       [user_1, user_2, user_3],
    //       hre,
    //     );

    //     const feeReceiver = user_3;
    //     const feeNumerator = 0;
    //     await easyAuction
    //       .connect(user_1)
    //       .setFeeParameters(feeNumerator, feeReceiver.address);

    //     await sendTxAndGetReturnValue(
    //       easyAuction,
    //       "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
    //       tokenIn.address,
    //       tokenOut.address,
    //       60 * 60,
    //       60 * 60,
    //       initialAuctionOrder.orderTokenIn,
    //       initialAuctionOrder.orderTokenOut,
    //       1,
    //       0,
    //       false,
    //     );
    //     await placeOrders(easyAuction, sellOrders, hre);
    //     // resets the ownerId, as they are only given during function call.
    //     sellOrders = await getAllSellOrders(easyAuction);
    //     await easyAuction
    //       .connect(user_1)
    //       .setFeeParameters(10, feeReceiver.address);

    //     await increaseTime(3601);
    //     await expect(() =>
    //       easyAuction.settleAuction(),
    //     ).to.changeTokenBalances(
    //       tokenIn,
    //       [feeReceiver],
    //       [BigNumber.from(0)],
    //     );

    //     // contract still holds sufficient funds to pay the participants fully
    //     await easyAuction.callStatic.claimFromParticipantOrder(
    //       sellOrders.map((order) => encodeOrder(order)),
    //     );
    //   });
    //   it("claims fees fully for a partially filled initialAuctionOrder", async () => {
    //     const initialAuctionOrder = {
    //       orderTokenIn: ethers.utils.parseEther("1"),
    //       orderTokenOut: ethers.utils.parseEther("1"),
    //       ownerId: BigNumber.from(0),
    //     };
    //     let sellOrders = [
    //       {
    //         orderTokenIn: ethers.utils.parseEther("1").div(2),
    //         orderTokenOut: ethers.utils.parseEther("1").div(2).sub(1),
    //         ownerId: BigNumber.from(3),
    //       },
    //     ];
    //     const {
    //       tokenIn,
    //       tokenOut,
    //     } = await createTokensAndMintAndApprove(
    //       easyAuction,
    //       [user_1, user_2, user_3],
    //       hre,
    //     );

    //     const feeReceiver = user_3;
    //     const feeNumerator = 10;
    //     await easyAuction
    //       .connect(user_1)
    //       .setFeeParameters(feeNumerator, feeReceiver.address);

    //     await sendTxAndGetReturnValue(
    //       easyAuction,
    //       "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
    //       tokenIn.address,
    //       tokenOut.address,
    //       60 * 60,
    //       60 * 60,
    //       initialAuctionOrder.orderTokenIn,
    //       initialAuctionOrder.orderTokenOut,
    //       1,
    //       0,
    //       false,
    //     );
    //     await placeOrders(easyAuction, sellOrders, hre);
    //     // resets the ownerId, as they are only given during function call.
    //     sellOrders = await getAllSellOrders(easyAuction);

    //     await increaseTime(3601);
    //     await expect(() =>
    //       easyAuction.settleAuction(),
    //     ).to.changeTokenBalances(
    //       tokenIn,
    //       [user_1, feeReceiver],
    //       [
    //         // since only halve of the tokens were sold, he is getting halve of the tokens plus halve of the fee back
    //         initialAuctionOrder.orderTokenIn
    //           .div(2)
    //           .add(
    //             initialAuctionOrder.orderTokenIn
    //               .mul(feeNumerator)
    //               .div("1000")
    //               .div(2),
    //           ),
    //         initialAuctionOrder.orderTokenIn.mul(feeNumerator).div("1000").div(2),
    //       ],
    //     );
    //     // contract still holds sufficient funds to pay the participants fully
    //     await easyAuction.callStatic.claimFromParticipantOrder(
    //       sellOrders.map((order) => encodeOrder(order)),
    //     );
    //   });
    // });
    // describe("setFeeParameters", async () => {
    //   it("can only be called by owner", async () => {
    //     const feeReceiver = user_3;
    //     const feeNumerator = 10;
    //     await expect(
    //       easyAuction
    //         .connect(user_2)
    //         .setFeeParameters(feeNumerator, feeReceiver.address),
    //     ).to.be.revertedWith("Ownable: caller is not the owner");
    //   });
    //   it("does not allow fees higher than 1.5%", async () => {
    //     const feeReceiver = user_3;
    //     const feeNumerator = 16;
    //     await expect(
    //       easyAuction
    //         .connect(user_1)
    //         .setFeeParameters(feeNumerator, feeReceiver.address),
    //     ).to.be.revertedWith("Fee is not allowed to be set higher than 1.5%");
    //   });
    // });
});
