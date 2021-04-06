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

describe("FairSale", async () => {
    const [user_1, user_2, user_3] = waffle.provider.getWallets();
    let fairSale: Contract;

    function encodeInitDataFairSale(
        tokenIn: string,
        tokenOut: string,
        orderCancelationPeriodDuration: number,
        duration: number,
        totalTokenOutAmount: BigNumber,
        minBidAmountToReceive: BigNumber,
        minimumBiddingAmountPerOrder: BigNumber,
        minSellThreshold: BigNumber,
        isAtomicClosureAllowed: boolean
    ) {
        return ethers.utils.defaultAbiCoder.encode(
            [
                "address",
                "address",
                "uint256",
                "uint256",
                "uint96",
                "uint96",
                "uint256",
                "uint256",
                "bool",
            ],
            [
                tokenIn,
                tokenOut,
                orderCancelationPeriodDuration,
                duration,
                totalTokenOutAmount,
                minBidAmountToReceive,
                minimumBiddingAmountPerOrder,
                minSellThreshold,
                isAtomicClosureAllowed,
            ]
        );
    }

    beforeEach(async () => {
        const FairSale = await ethers.getContractFactory("FairSale");

        fairSale = await FairSale.deploy();
    });
    describe("initAuction", async () => {
        it("throws if minimumBiddingAmountPerOrder is zero", async () => {
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("1"),
                BigNumber.from(0),
                BigNumber.from(0),
                false
            );

            await expect(fairSale.init(initData)).to.be.revertedWith(
                "minimumBiddingAmountPerOrder is not allowed to be zero"
            );
        });
        it("throws if auctioned amount is zero", async () => {
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                BigNumber.from(0),
                ethers.utils.parseEther("1"),
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await expect(fairSale.init(initData)).to.be.revertedWith(
                "cannot auction zero tokens"
            );
        });
        it("throws if auction is a giveaway", async () => {
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                ethers.utils.parseEther("1"),
                BigNumber.from(0),
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await expect(fairSale.init(initData)).to.be.revertedWith(
                "tokens cannot be auctioned for free"
            );
        });
        it("initAuction stores the parameters correctly", async () => {
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                fairSale,
                [user_1, user_2],
                hre
            );

            const timestampForMining = 2000000000;
            ethers.provider.send("evm_setNextBlockTimestamp", [
                timestampForMining,
            ]);

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                ethers.utils.parseEther("2"),
                ethers.utils.parseEther("1"),
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            fairSale.init(initData);
            expect(await fairSale.tokenOut()).to.equal(tokenOut.address);
            expect(await fairSale.tokenIn()).to.equal(tokenIn.address);
            expect(await fairSale.initialAuctionOrder()).to.equal(
                encodeOrder({
                    ownerId: BigNumber.from(1),
                    orderTokenOut: ethers.utils.parseEther("2"),
                    orderTokenIn: ethers.utils.parseEther("1"),
                })
            );
            expect(await fairSale.endDate()).to.be.equal(
                timestampForMining + 3600
            );
            expect(await fairSale.orderCancellationEndDate()).to.be.equal(
                timestampForMining + 3600
            );
            expect(await fairSale.auctionStartedDate()).to.be.equal(
                timestampForMining
            );
            expect(await fairSale.minimumBiddingAmountPerOrder()).to.be.equal(
                1
            );
            expect(await fairSale.interimSumBidAmount()).to.be.equal(0);
            await expect(await fairSale.clearingPriceOrder()).to.equal(
                encodeOrder({
                    ownerId: BigNumber.from(0),
                    orderTokenIn: ethers.utils.parseEther("0"),
                    orderTokenOut: ethers.utils.parseEther("0"),
                })
            );
            expect(await fairSale.volumeClearingPriceOrder()).to.be.equal(0);

            expect(await tokenOut.balanceOf(fairSale.address)).to.equal(
                ethers.utils.parseEther("2")
            );
        });
    });
    describe("getUserId", async () => {
        it("creates new ownerIds", async () => {
            expect(
                await sendTxAndGetReturnValue(
                    fairSale,
                    "getUserId(address)",
                    user_1.address
                )
            ).to.equal(1);
            expect(
                await sendTxAndGetReturnValue(
                    fairSale,
                    "getUserId(address)",
                    user_2.address
                )
            ).to.equal(2);
            expect(
                await sendTxAndGetReturnValue(
                    fairSale,
                    "getUserId(address)",
                    user_1.address
                )
            ).to.equal(1);
        });
    });
    describe("placeOrders", async () => {
        it("one can not place orders, if auction is not yet initiated", async () => {
            await expect(
                fairSale.placeOrders(
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
        //     fairSale,
        //     [user_1, user_2],
        //     hre,
        //   );
        //   fairSale.initAuction(
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
        //   await closeAuction(fairSale);
        //   await expect(
        //     fairSale.placeOrders(
        //       [ethers.utils.parseEther("1")],
        //       [ethers.utils.parseEther("1").add(1)],
        //       [queueStartElement],
        //     ),
        //   ).to.be.revertedWith("no longer in order placement phase");
        // });
        it("one can not place orders, with a worser or same rate", async () => {
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                ethers.utils.parseEther("2"),
                ethers.utils.parseEther("1"),
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            fairSale.init(initData);
            await expect(
                fairSale.placeOrders(
                    [ethers.utils.parseEther("2").add(1)],
                    [ethers.utils.parseEther("1")],
                    [queueStartElement]
                )
            ).to.be.revertedWith("limit price not better than mimimal offer");
            await expect(
                fairSale.placeOrders(
                    [ethers.utils.parseEther("2")],
                    [ethers.utils.parseEther("1")],
                    [queueStartElement]
                )
            ).to.be.revertedWith("limit price not better than mimimal offer");
        });
        it("does not withdraw funds, if orders are placed twice", async () => {
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                ethers.utils.parseEther("2"),
                ethers.utils.parseEther("1"),
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            fairSale.init(initData);
            await expect(() =>
                fairSale.placeOrders(
                    [ethers.utils.parseEther("2").sub(1)],
                    [ethers.utils.parseEther("1")],
                    [queueStartElement]
                )
            ).to.changeTokenBalances(
                tokenIn,
                [user_1],
                [ethers.utils.parseEther("-1")]
            );
            await expect(() =>
                fairSale.placeOrders(
                    [ethers.utils.parseEther("2").sub(1)],
                    [ethers.utils.parseEther("1")],
                    [queueStartElement]
                )
            ).to.changeTokenBalances(tokenIn, [user_1], [BigNumber.from(0)]);
        });
        it("places a new order and checks that tokens were transferred", async () => {
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                ethers.utils.parseEther("2"),
                ethers.utils.parseEther("1"),
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            fairSale.init(initData);
            const balanceBeforeOrderPlacement = await tokenIn.balanceOf(
                user_1.address
            );
            const orderTokenIn = ethers.utils.parseEther("1").add(1);
            const orderTokenOut = ethers.utils.parseEther("2");

            await fairSale.placeOrders(
                [orderTokenOut, orderTokenOut],
                [orderTokenIn, orderTokenIn.add(1)],
                [queueStartElement, queueStartElement]
            );
            const transferredtokenInAmount = orderTokenIn.add(
                orderTokenIn.add(1)
            );

            expect(await tokenIn.balanceOf(fairSale.address)).to.equal(
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                ethers.utils.parseEther("1").div(1000),
                BigNumber.from(0),
                false
            );

            fairSale.init(initData);
            await expect(
                fairSale.placeOrders(
                    sellOrders.map((buyOrder) => buyOrder.orderTokenOut),
                    sellOrders.map((buyOrder) => buyOrder.orderTokenIn),
                    Array(sellOrders.length).fill(queueStartElement)
                )
            ).to.be.revertedWith("order too small");
        });
        it("fails, if transfers are failing", async () => {
            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                ethers.utils.parseEther("2"),
                ethers.utils.parseEther("1"),
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            fairSale.init(initData);
            const orderTokenIn = ethers.utils.parseEther("1").add(1);
            const orderTokenOut = ethers.utils.parseEther("1");
            await tokenIn.approve(
                fairSale.address,
                ethers.utils.parseEther("0")
            );

            await expect(
                fairSale.placeOrders(
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);
            await closeAuction(fairSale);
            await expect(
                fairSale.precalculateSellAmountSum(3)
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await closeAuction(fairSale);
            await expect(
                fairSale.precalculateSellAmountSum(2)
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);
            await closeAuction(fairSale);

            await fairSale.precalculateSellAmountSum(1);
            expect(await fairSale.interimSumBidAmount()).to.equal(
                sellOrders[0].orderTokenIn
            );

            expect(await fairSale.interimOrder()).to.equal(
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);
            await closeAuction(fairSale);

            await fairSale.precalculateSellAmountSum(1);
            await fairSale.precalculateSellAmountSum(1);
            expect(await fairSale.interimSumBidAmount()).to.equal(
                sellOrders[0].orderTokenIn.add(sellOrders[0].orderTokenIn)
            );

            expect(await fairSale.interimOrder()).to.equal(
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);

            await placeOrders(fairSale, sellOrders, hre);

            await increaseTime(3601);

            await fairSale.settleAuction();

            expect(await fairSale.clearingPriceOrder()).to.equal(
                encodeOrder(initialAuctionOrder)
            );
            expect(await fairSale.volumeClearingPriceOrder()).to.equal(0);
            await claimFromAllOrders(fairSale, sellOrders);
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
                fairSale,
                [user_1, user_2, user_3],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);

            await placeOrders(fairSale, sellOrders, hre);

            await increaseTime(3601);

            await fairSale.settleAuction();

            expect(await fairSale.clearingPriceOrder()).to.equal(
                encodeOrder(initialAuctionOrder)
            );
            expect(await fairSale.volumeClearingPriceOrder()).to.equal(0);
            await claimFromAllOrders(fairSale, sellOrders);
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);

            await placeOrders(fairSale, sellOrders, hre);

            await increaseTime(3601);
            await fairSale.settleAuction();

            expect(await fairSale.clearingPriceOrder()).to.equal(
                encodeOrder(initialAuctionOrder)
            );
            expect(await fairSale.volumeClearingPriceOrder()).to.equal(0);
            await fairSale.claimFromParticipantOrder(
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
                fairSale,
                [user_1, user_2, user_3],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);

            await placeOrders(fairSale, sellOrders, hre);

            await increaseTime(3601);
            await fairSale.settleAuction();

            expect(await fairSale.clearingPriceOrder()).to.equal(
                encodeOrder({
                    orderTokenIn: ethers.utils.parseEther("3"),
                    orderTokenOut: initialAuctionOrder.orderTokenOut,
                    ownerId: BigNumber.from(0),
                })
            );
            expect(await fairSale.volumeClearingPriceOrder()).to.equal(0);
            await claimFromAllOrders(fairSale, sellOrders);
        });
        it("checks case 8, it verifies the price in case of no participation of the auction", async () => {
            const initialAuctionOrder = {
                orderTokenIn: BigNumber.from(1000),
                orderTokenOut: BigNumber.from(1000),
                ownerId: BigNumber.from(0),
            };

            const { tokenIn, tokenOut } = await createTokensAndMintAndApprove(
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);

            await increaseTime(3601);
            await fairSale.settleAuction();

            expect(await fairSale.clearingPriceOrder()).to.equal(
                encodeOrder(initialAuctionOrder)
            );
            expect(await fairSale.volumeClearingPriceOrder()).to.equal(
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await increaseTime(3601);
            await fairSale.settleAuction();
            expect(await fairSale.clearingPriceOrder()).to.equal(
                encodeOrder({
                    orderTokenIn: sellOrders[0].orderTokenIn,
                    orderTokenOut: initialAuctionOrder.orderTokenOut,
                    ownerId: BigNumber.from(0),
                })
            );
            expect(await fairSale.volumeClearingPriceOrder()).to.equal(0);
            await claimFromAllOrders(fairSale, sellOrders);
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await increaseTime(3601);
            await fairSale.settleAuction();

            expect(await fairSale.clearingPriceOrder()).to.equal(
                encodeOrder(sellOrders[0])
            );
            expect(await fairSale.volumeClearingPriceOrder()).to.equal(
                initialAuctionOrder.orderTokenOut
                    .mul(sellOrders[0].orderTokenIn)
                    .div(sellOrders[0].orderTokenOut)
            );
            await claimFromAllOrders(fairSale, sellOrders);
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
                fairSale,
                [user_1, user_2, user_3],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await increaseTime(3601);
            await fairSale.settleAuction();

            expect(await fairSale.clearingPriceOrder()).to.eql(
                encodeOrder(sellOrders[1])
            );
            expect(await fairSale.volumeClearingPriceOrder()).to.equal(
                sellOrders[1].orderTokenIn
            );
            await expect(() =>
                fairSale.claimFromParticipantOrder([encodeOrder(sellOrders[0])])
            ).to.changeTokenBalances(
                tokenOut,
                [user_2],
                [sellOrders[0].orderTokenIn]
            );
            await expect(() =>
                fairSale.claimFromParticipantOrder([encodeOrder(sellOrders[1])])
            ).to.changeTokenBalances(
                tokenOut,
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
                fairSale,
                [user_1, user_2, user_3],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);

            await placeOrders(fairSale, sellOrders, hre);

            await increaseTime(3601);
            await fairSale.settleAuction();

            expect(await fairSale.clearingPriceOrder()).to.eql(
                encodeOrder(sellOrders[1])
            );
            expect(await fairSale.volumeClearingPriceOrder()).to.equal(
                sellOrders[1].orderTokenIn
            );

            await expect(() =>
                fairSale.claimFromParticipantOrder([encodeOrder(sellOrders[0])])
            ).to.changeTokenBalances(
                tokenOut,
                [user_1],
                [sellOrders[0].orderTokenIn]
            );

            await expect(() =>
                fairSale.claimFromParticipantOrder([encodeOrder(sellOrders[1])])
            ).to.changeTokenBalances(
                tokenOut,
                [user_2],
                [sellOrders[1].orderTokenIn]
            );

            await expect(() =>
                fairSale.claimFromParticipantOrder([encodeOrder(sellOrders[2])])
            ).to.changeTokenBalances(
                tokenIn,
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
                fairSale,
                [user_1, user_2, user_3],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await increaseTime(3601);
            await fairSale.settleAuction();

            expect(await fairSale.clearingPriceOrder()).to.equal(
                encodeOrder(sellOrders[0])
            );
            expect(await fairSale.volumeClearingPriceOrder()).to.equal(
                sellOrders[1].orderTokenIn
            );
            await expect(() =>
                fairSale.claimFromParticipantOrder([encodeOrder(sellOrders[0])])
            ).to.changeTokenBalances(
                tokenOut,
                [user_2],
                [sellOrders[0].orderTokenIn]
            );
            await expect(() =>
                fairSale.claimFromParticipantOrder([encodeOrder(sellOrders[1])])
            ).to.changeTokenBalances(
                tokenIn,
                [user_3],
                [sellOrders[1].orderTokenIn]
            );
            await expect(() =>
                fairSale.claimFromParticipantOrder([encodeOrder(sellOrders[2])])
            ).to.changeTokenBalances(
                tokenOut,
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await increaseTime(3601);
            await fairSale.settleAuction();

            expect(await fairSale.clearingPriceOrder()).to.eql(
                encodeOrder(sellOrders[1])
            );
            expect(await fairSale.volumeClearingPriceOrder()).to.equal(0);
            await claimFromAllOrders(fairSale, sellOrders);
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await increaseTime(3601);
            // this is the additional step
            await fairSale.precalculateSellAmountSum(1);

            await fairSale.settleAuction();

            expect(await fairSale.clearingPriceOrder()).to.eql(
                encodeOrder(sellOrders[1])
            );
            expect(await fairSale.volumeClearingPriceOrder()).to.equal(0);
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await increaseTime(3601);
            // this is the additional step
            await fairSale.precalculateSellAmountSum(1);

            expect(await fairSale.interimSumBidAmount()).to.equal(
                sellOrders[0].orderTokenIn
            );
            expect(await fairSale.interimOrder()).to.equal(
                encodeOrder(sellOrders[0])
            );
            await fairSale.settleAuction();

            expect(await fairSale.clearingPriceOrder()).to.eql(
                encodeOrder(sellOrders[2])
            );
            expect(await fairSale.volumeClearingPriceOrder()).to.equal(0);
            await claimFromAllOrders(fairSale, sellOrders);
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await increaseTime(3601);
            await fairSale.settleAuction();

            expect(await fairSale.clearingPriceOrder()).to.be.equal(
                encodeOrder(sellOrders[1])
            );
            expect(await fairSale.volumeClearingPriceOrder()).to.equal(0);
            await claimFromAllOrders(fairSale, sellOrders);
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await increaseTime(3601);
            const price = await calculateClearingPrice(fairSale);

            await fairSale.settleAuction();
            expect(price).to.eql(initialAuctionOrder);

            expect(await fairSale.clearingPriceOrder()).to.equal(
                encodeOrder(reverseOrderPrice(initialAuctionOrder))
            );
            expect(await fairSale.volumeClearingPriceOrder()).to.equal(0);
            await claimFromAllOrders(fairSale, sellOrders);
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                ethers.utils.parseEther("5"),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await increaseTime(3601);
            const price = await calculateClearingPrice(fairSale);

            await fairSale.settleAuction();
            expect(price).to.eql(initialAuctionOrder);

            expect(await fairSale.minSellThresholdNotReached()).to.equal(true);
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
                fairSale,
                [user_1, user_2, user_3],
                hre
            );
            const tokenOutBalanceBeforeAuction = await tokenOut.balanceOf(
                user_1.address
            );
            //const feeReceiver = user_3;
            //const feeNumerator = 10;
            // await fairSale
            //   .connect(user_1)
            //   .setFeeParameters(feeNumerator, feeReceiver.address);

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                ethers.utils.parseEther("5"),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);
            await closeAuction(fairSale);
            await fairSale.settleAuction();

            expect(await fairSale.minSellThresholdNotReached()).to.equal(true);
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );
            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);
            await closeAuction(fairSale);
            const price = await calculateClearingPrice(fairSale);
            const callPromise = fairSale.settleAuction();
            // auctioneer reward check:
            await expect(() => callPromise).to.changeTokenBalances(
                tokenIn,
                [user_1],
                [0]
            );
            await expect(callPromise)
                .to.emit(tokenIn, "Transfer")
                .withArgs(fairSale.address, user_1.address, price.orderTokenIn);
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);
            await closeAuction(fairSale);
            const callPromise = fairSale.settleAuction();
            // auctioneer reward check:
            await expect(callPromise)
                .to.emit(tokenOut, "Transfer")
                .withArgs(
                    fairSale.address,
                    user_1.address,
                    initialAuctionOrder.orderTokenIn.sub(
                        sellOrders[0].orderTokenIn
                    )
                );
            await expect(callPromise)
                .to.emit(tokenIn, "Transfer")
                .withArgs(
                    fairSale.address,
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                ethers.utils.parseEther("5"),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);
            await closeAuction(fairSale);
            await fairSale.settleAuction();
            await expect(() =>
                fairSale.claimFromParticipantOrder(
                    sellOrders.map((order) => encodeOrder(order))
                )
            ).to.changeTokenBalances(
                tokenIn,
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await expect(
                fairSale.claimFromParticipantOrder(
                    sellOrders.map((order) => encodeOrder(order))
                )
            ).to.be.revertedWith("Auction not yet finished");
            await closeAuction(fairSale);
            await expect(
                fairSale.claimFromParticipantOrder(
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
                fairSale,
                [user_1, user_2],
                hre
            );
            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);
            await closeAuction(fairSale);
            const price = await calculateClearingPrice(fairSale);
            await fairSale.settleAuction();

            const receivedAmounts = toReceivedFunds(
                await fairSale.callStatic.claimFromParticipantOrder([
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);
            await closeAuction(fairSale);
            await fairSale.settleAuction();
            const receivedAmounts = toReceivedFunds(
                await fairSale.callStatic.claimFromParticipantOrder([
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);
            await closeAuction(fairSale);
            const price = await calculateClearingPrice(fairSale);
            await fairSale.settleAuction();

            const receivedAmounts = toReceivedFunds(
                await fairSale.callStatic.claimFromParticipantOrder([
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);
            await closeAuction(fairSale);
            await fairSale.settleAuction();
            await fairSale.claimFromParticipantOrder([
                encodeOrder(sellOrders[0]),
            ]),
                await expect(
                    fairSale.claimFromParticipantOrder([
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
                fairSale,
                [user_1, user_2],
                hre
            );
            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);
            await closeAuction(fairSale);
            await fairSale.settleAuction();
            await expect(
                fairSale.claimFromParticipantOrder([
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await closeAuction(fairSale);
            const price = await calculateClearingPrice(fairSale);
            await fairSale.settleAuction();

            const receivedAmounts = toReceivedFunds(
                await fairSale.callStatic.claimFromParticipantOrder([
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await closeAuction(fairSale);
            await expect(
                fairSale.settleAuctionAtomically(
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                true
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await closeAuction(fairSale);
            await fairSale
                .connect(user_2)
                .settleAuctionAtomically(
                    [atomicSellOrders[0].orderTokenOut],
                    [atomicSellOrders[0].orderTokenIn],
                    [queueStartElement]
                );
            expect(await fairSale.clearingPriceOrder()).to.equal(
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await expect(
                fairSale
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
            await fairSale.registerUser(user_1.address);
            await expect(
                fairSale.registerUser(user_1.address)
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await expect(fairSale.cancelOrders([encodeOrder(sellOrders[0])]))
                .to.emit(tokenIn, "Transfer")
                .withArgs(
                    fairSale.address,
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await increaseTime(3601);
            await expect(
                fairSale.cancelOrders([encodeOrder(sellOrders[0])])
            ).to.be.revertedWith(
                "revert no longer in order placement and cancelation phase"
            );
            await increaseTime(3601);
            await expect(
                fairSale.cancelOrders([encodeOrder(sellOrders[0])])
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            // removes the order
            fairSale.cancelOrders([encodeOrder(sellOrders[0])]);
            // claims 0 orderTokenIn tokens
            await expect(fairSale.cancelOrders([encodeOrder(sellOrders[0])]))
                .to.emit(tokenIn, "Transfer")
                .withArgs(fairSale.address, user_1.address, 0);
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await expect(
                fairSale.cancelOrders([encodeOrder(sellOrders[0])])
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await placeOrders(fairSale, sellOrders, hre);

            await closeAuction(fairSale);
            expect(
                await fairSale.callStatic.containsOrder(
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
                fairSale,
                [user_1, user_2],
                hre
            );

            const initData = encodeInitDataFairSale(
                tokenIn.address,
                tokenOut.address,
                60 * 60,
                60 * 60,
                initialAuctionOrder.orderTokenOut,
                initialAuctionOrder.orderTokenIn,
                BigNumber.from(1),
                BigNumber.from(0),
                false
            );

            await fairSale.init(initData);
            await closeAuction(fairSale);
            expect(
                await fairSale.callStatic.getSecondsRemainingInBatch()
            ).to.be.equal("0");
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
    //       fairSale,
    //       [user_1, user_2, user_3],
    //       hre,
    //     );

    //     const feeReceiver = user_3;
    //     const feeNumerator = 10;
    //     await fairSale
    //       .connect(user_1)
    //       .setFeeParameters(feeNumerator, feeReceiver.address);

    //     await sendTxAndGetReturnValue(
    //       fairSale,
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
    //     await placeOrders(fairSale, sellOrders, hre);
    //     // resets the ownerId, as they are only given during function call.
    //     sellOrders = await getAllSellOrders(fairSale);

    //     await increaseTime(3601);
    //     await expect(() =>
    //       fairSale.settleAuction(),
    //     ).to.changeTokenBalances(
    //       tokenIn,
    //       [feeReceiver],
    //       [initialAuctionOrder.orderTokenIn.mul(feeNumerator).div("1000")],
    //     );

    //     // contract still holds sufficient funds to pay the participants fully
    //     await fairSale.callStatic.claimFromParticipantOrder(
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
    //       fairSale,
    //       [user_1, user_2, user_3],
    //       hre,
    //     );

    //     const feeReceiver = user_3;
    //     const feeNumerator = 0;
    //     await fairSale
    //       .connect(user_1)
    //       .setFeeParameters(feeNumerator, feeReceiver.address);

    //     await sendTxAndGetReturnValue(
    //       fairSale,
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
    //     await placeOrders(fairSale, sellOrders, hre);
    //     // resets the ownerId, as they are only given during function call.
    //     sellOrders = await getAllSellOrders(fairSale);
    //     await fairSale
    //       .connect(user_1)
    //       .setFeeParameters(10, feeReceiver.address);

    //     await increaseTime(3601);
    //     await expect(() =>
    //       fairSale.settleAuction(),
    //     ).to.changeTokenBalances(
    //       tokenIn,
    //       [feeReceiver],
    //       [BigNumber.from(0)],
    //     );

    //     // contract still holds sufficient funds to pay the participants fully
    //     await fairSale.callStatic.claimFromParticipantOrder(
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
    //       fairSale,
    //       [user_1, user_2, user_3],
    //       hre,
    //     );

    //     const feeReceiver = user_3;
    //     const feeNumerator = 10;
    //     await fairSale
    //       .connect(user_1)
    //       .setFeeParameters(feeNumerator, feeReceiver.address);

    //     await sendTxAndGetReturnValue(
    //       fairSale,
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
    //     await placeOrders(fairSale, sellOrders, hre);
    //     // resets the ownerId, as they are only given during function call.
    //     sellOrders = await getAllSellOrders(fairSale);

    //     await increaseTime(3601);
    //     await expect(() =>
    //       fairSale.settleAuction(),
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
    //     await fairSale.callStatic.claimFromParticipantOrder(
    //       sellOrders.map((order) => encodeOrder(order)),
    //     );
    //   });
    // });
    // describe("setFeeParameters", async () => {
    //   it("can only be called by owner", async () => {
    //     const feeReceiver = user_3;
    //     const feeNumerator = 10;
    //     await expect(
    //       fairSale
    //         .connect(user_2)
    //         .setFeeParameters(feeNumerator, feeReceiver.address),
    //     ).to.be.revertedWith("Ownable: caller is not the owner");
    //   });
    //   it("does not allow fees higher than 1.5%", async () => {
    //     const feeReceiver = user_3;
    //     const feeNumerator = 16;
    //     await expect(
    //       fairSale
    //         .connect(user_1)
    //         .setFeeParameters(feeNumerator, feeReceiver.address),
    //     ).to.be.revertedWith("Fee is not allowed to be set higher than 1.5%");
    //   });
    // });
});
