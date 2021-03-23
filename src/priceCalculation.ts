import { Contract, BigNumber, Wallet } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
export interface Price {
    priceNumerator: BigNumber;
    priceDenominator: BigNumber;
}

export interface ReceivedFunds {
    tokenOutAmount: BigNumber;
    tokenInAmount: BigNumber;
}

export interface OrderResult {
    tokenIn: string;
    tokenOut: string;
    endDate: BigNumber;
    orderCancellationEndDate: BigNumber;
    initialAuctionOrder: string;
    minimumBiddingAmountPerOrder: BigNumber;
    interimSumBidAmount: BigNumber;
    interimOrder: string;
    clearingPriceOrder: string;
    volumeClearingPriceOrder: BigNumber;
    feeNumerator: BigNumber;
}

export interface Order {
    orderTokenIn: BigNumber;
    orderTokenOut: BigNumber;
    ownerId: BigNumber;
}

export const queueStartElement =
    "0x0000000000000000000000000000000000000000000000000000000000000001";
export const queueLastElement =
    "0xffffffffffffffffffffffffffffffffffffffff000000000000000000000001";

export function reverseOrderPrice(order: Order): Order {
    return {
        ownerId: order.ownerId,
        orderTokenIn: order.orderTokenOut,
        orderTokenOut: order.orderTokenIn,
    };
}
export function encodeOrder(order: Order): string {
    return (
        "0x" +
        order.ownerId.toHexString().slice(2).padStart(16, "0") +
        order.orderTokenOut.toHexString().slice(2).padStart(24, "0") +
        order.orderTokenIn.toHexString().slice(2).padStart(24, "0")
    );
}

export function decodeOrder(bytes: string): Order {
    return {
        ownerId: BigNumber.from("0x" + bytes.substring(2, 18)),
        orderTokenIn: BigNumber.from("0x" + bytes.substring(43, 66)),
        orderTokenOut: BigNumber.from("0x" + bytes.substring(19, 42)),
    };
}

export function toReceivedFunds(result: [BigNumber, BigNumber]): ReceivedFunds {
    return {
        tokenOutAmount: result[0],
        tokenInAmount: result[1],
    };
}

export async function getInitialOrder(easyAuction: Contract): Promise<Order> {
    return decodeOrder(await easyAuction.initialAuctionOrder());
}

export function hasLowerClearingPrice(order1: Order, order2: Order): number {
    if (
        order1.orderTokenOut
            .mul(order2.orderTokenIn)
            .lt(order2.orderTokenOut.mul(order1.orderTokenIn))
    )
        return -1;
    if (
        order1.orderTokenOut
            .mul(order2.orderTokenIn)
            .eq(order2.orderTokenOut.mul(order1.orderTokenIn))
    ) {
        if (order1.ownerId < order2.ownerId) return -1;
    }
    return 1;
}

export async function calculateClearingPrice(
    easyAuction: Contract,
    debug = false
): Promise<Order> {
    const log = debug ? (...a: any) => console.log(...a) : () => {};
    const initialOrder = await getInitialOrder(easyAuction);
    const sellOrders = await getAllSellOrders(easyAuction);
    sellOrders.sort(function (a: Order, b: Order) {
        return hasLowerClearingPrice(a, b);
    });

    printOrders(sellOrders, false, debug);
    printOrders([initialOrder], true, debug);
    const clearingPriceOrder = findClearingPrice(sellOrders, initialOrder);
    log("clearing price order:");
    printOrders([clearingPriceOrder], false, debug);
    return clearingPriceOrder;
}

function printOrders(orders: Order[], isInitialOrder: boolean, debug = false) {
    const log = debug ? (...a: any) => console.log(...a) : () => {};

    if (isInitialOrder) {
        log("Initial order");
        orders.map((order) => {
            log(
                "selling ",
                order.orderTokenIn.toString(),
                " for ",
                order.orderTokenOut.toString(),
                " at price of",
                order.orderTokenIn.div(order.orderTokenOut).toString()
            );
        });
    } else {
        log("Participation orders");
        orders.map((order) => {
            log(
                "selling ",
                order.orderTokenIn.toString(),
                " for ",
                order.orderTokenOut.toString(),
                " at price of",
                order.orderTokenOut.div(order.orderTokenIn).toString()
            );
        });
    }
}

export function findClearingPrice(
    sellOrders: Order[],
    initialAuctionOrder: Order
): Order {
    sellOrders.forEach(function (order, index) {
        if (index > 1) {
            if (!hasLowerClearingPrice(sellOrders[index - 1], order)) {
                throw Error("The orders must be sorted");
            }
        }
    });
    let totalSellVolume = BigNumber.from(0);

    for (const order of sellOrders) {
        totalSellVolume = totalSellVolume.add(order.orderTokenIn);
        if (
            totalSellVolume
                .mul(order.orderTokenOut)
                .gte(initialAuctionOrder.orderTokenOut.mul(order.orderTokenIn))
        ) {
            const coveredBuyAmount = initialAuctionOrder.orderTokenOut.sub(
                totalSellVolume
                    .sub(order.orderTokenIn)
                    .mul(order.orderTokenOut)
                    .div(order.orderTokenIn)
            );
            const sellAmountClearingOrder = coveredBuyAmount
                .mul(order.orderTokenIn)
                .div(order.orderTokenOut);
            if (sellAmountClearingOrder.gt(BigNumber.from(0))) {
                return order;
            } else {
                return {
                    ownerId: BigNumber.from(1),
                    orderTokenOut: initialAuctionOrder.orderTokenOut,
                    orderTokenIn: totalSellVolume.sub(order.orderTokenIn),
                };
            }
        }
    }
    // otherwise, clearing price is initialAuctionOrder
    if (totalSellVolume.gt(initialAuctionOrder.orderTokenIn)) {
        return {
            ownerId: initialAuctionOrder.ownerId,
            orderTokenOut: initialAuctionOrder.orderTokenOut,
            orderTokenIn: totalSellVolume,
        };
    } else {
        return {
            ownerId: BigNumber.from(0),
            orderTokenOut: initialAuctionOrder.orderTokenOut,
            orderTokenIn: initialAuctionOrder.orderTokenIn,
        };
    }
}

export async function getAllSellOrders(
    easyAuction: Contract
): Promise<Order[]> {
    const filterSellOrders = easyAuction.filters.NewOrder(null, null, null);
    const logs = await easyAuction.queryFilter(filterSellOrders, 0, "latest");
    const events = logs.map((log: any) => easyAuction.interface.parseLog(log));
    const sellOrders = events.map((x: any) => {
        const order: Order = {
            ownerId: x.args[0],
            orderTokenIn: x.args[2],
            orderTokenOut: x.args[1],
        };
        return order;
    });

    const filterOrderCancellations = easyAuction.filters.CancellationOrder;
    const logsForCancellations = await easyAuction.queryFilter(
        filterOrderCancellations(),
        0,
        "latest"
    );
    const eventsForCancellations = logsForCancellations.map((log: any) =>
        easyAuction.interface.parseLog(log)
    );
    const sellOrdersDeletions = eventsForCancellations.map((x: any) => {
        const order: Order = {
            ownerId: x.args[0],
            orderTokenIn: x.args[2],
            orderTokenOut: x.args[1],
        };
        return order;
    });
    for (const orderDeletion of sellOrdersDeletions) {
        sellOrders.splice(sellOrders.indexOf(orderDeletion), 1);
    }
    return sellOrders;
}

export async function createTokensAndMintAndApprove(
    easyAuction: Contract,
    users: Wallet[],
    hre: HardhatRuntimeEnvironment
): Promise<{ tokenIn: Contract; tokenOut: Contract }> {
    const ERC20 = await hre.ethers.getContractFactory("ERC20Mintable");
    const tokenIn = await ERC20.deploy("AT", "AT");
    const tokenOut = await ERC20.deploy("BT", "BT");

    for (const user of users) {
        await tokenIn.mint(user.address, BigNumber.from(10).pow(30));
        await tokenIn
            .connect(user)
            .approve(easyAuction.address, BigNumber.from(10).pow(30));

        await tokenOut.mint(user.address, BigNumber.from(10).pow(30));
        await tokenOut
            .connect(user)
            .approve(easyAuction.address, BigNumber.from(10).pow(30));
    }
    return { tokenIn: tokenIn, tokenOut: tokenOut };
}

export function toPrice(result: [BigNumber, BigNumber]): Price {
    return {
        priceNumerator: result[0],
        priceDenominator: result[1],
    };
}

export async function placeOrders(
    easyAuction: Contract,
    sellOrders: Order[],
    hre: HardhatRuntimeEnvironment
): Promise<void> {
    for (const sellOrder of sellOrders) {
        await easyAuction
            .connect(
                hre.waffle.provider.getWallets()[
                    sellOrder.ownerId.toNumber() - 1
                ]
            )
            .placeOrders(
                [sellOrder.orderTokenOut],
                [sellOrder.orderTokenIn],
                [queueStartElement]
            );
    }
}
