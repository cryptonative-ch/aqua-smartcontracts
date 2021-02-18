import { Contract, BigNumber, Wallet } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
export interface Price {
  priceNumerator: BigNumber;
  priceDenominator: BigNumber;
}

export interface ReceivedFunds {
  auctioningTokenAmount: BigNumber;
  biddingTokenAmount: BigNumber;
}

export interface OrderResult {
  auctioningToken: string;
  biddingToken: string;
  auctionEndDate: BigNumber;
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
  amountToBid: BigNumber;
  amountToBuy: BigNumber;
  userId: BigNumber;
}

export const queueStartElement =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
export const queueLastElement =
  "0xffffffffffffffffffffffffffffffffffffffff000000000000000000000001";

export function reverseOrderPrice(order: Order): Order {
  return {
    userId: order.userId,
    amountToBid: order.amountToBuy,
    amountToBuy: order.amountToBid,
  };
}
export function encodeOrder(order: Order): string {
  return (
    "0x" +
    order.userId.toHexString().slice(2).padStart(16, "0") +
    order.amountToBuy.toHexString().slice(2).padStart(24, "0") +
    order.amountToBid.toHexString().slice(2).padStart(24, "0")
  );
}

export function decodeOrder(bytes: string): Order {
  return {
    userId: BigNumber.from("0x" + bytes.substring(2, 18)),
    amountToBid: BigNumber.from("0x" + bytes.substring(43, 66)),
    amountToBuy: BigNumber.from("0x" + bytes.substring(19, 42)),
  };
}

export function toReceivedFunds(result: [BigNumber, BigNumber]): ReceivedFunds {
  return {
    auctioningTokenAmount: result[0],
    biddingTokenAmount: result[1],
  };
}

export async function getInitialOrder(
  easyAuction: Contract,
): Promise<Order> {
  return decodeOrder(await easyAuction.initialAuctionOrder());
}

export function hasLowerClearingPrice(order1: Order, order2: Order): number {
  if (
    order1.amountToBuy
      .mul(order2.amountToBid)
      .lt(order2.amountToBuy.mul(order1.amountToBid))
  )
    return -1;
  if (
    order1.amountToBuy
      .mul(order2.amountToBid)
      .eq(order2.amountToBuy.mul(order1.amountToBid))
  ) {
    if (order1.userId < order2.userId) return -1;
  }
  return 1;
}

export async function calculateClearingPrice(
  easyAuction: Contract,
  debug = false,
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
        order.amountToBid.toString(),
        " for ",
        order.amountToBuy.toString(),
        " at price of",
        order.amountToBid.div(order.amountToBuy).toString(),
      );
    });
  } else {
    log("Participation orders");
    orders.map((order) => {
      log(
        "selling ",
        order.amountToBid.toString(),
        " for ",
        order.amountToBuy.toString(),
        " at price of",
        order.amountToBuy.div(order.amountToBid).toString(),
      );
    });
  }
}

export function findClearingPrice(
  sellOrders: Order[],
  initialAuctionOrder: Order,
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
    totalSellVolume = totalSellVolume.add(order.amountToBid);
    if (
      totalSellVolume
        .mul(order.amountToBuy)
        .gte(initialAuctionOrder.amountToBid.mul(order.amountToBid))
    ) {
      const coveredBuyAmount = initialAuctionOrder.amountToBid.sub(
        totalSellVolume
          .sub(order.amountToBid)
          .mul(order.amountToBuy)
          .div(order.amountToBid),
      );
      const sellAmountClearingOrder = coveredBuyAmount
        .mul(order.amountToBid)
        .div(order.amountToBuy);
      if (sellAmountClearingOrder.gt(BigNumber.from(0))) {
        return order;
      } else {
        return {
          userId: BigNumber.from(1),
          amountToBuy: initialAuctionOrder.amountToBid,
          amountToBid: totalSellVolume.sub(order.amountToBid),
        };
      }
    }
  }
  // otherwise, clearing price is initialAuctionOrder
  if (totalSellVolume.gt(initialAuctionOrder.amountToBuy)) {
    return {
      userId: initialAuctionOrder.userId,
      amountToBuy: initialAuctionOrder.amountToBid,
      amountToBid: totalSellVolume,
    };
  } else {
    return {
      userId: BigNumber.from(0),
      amountToBuy: initialAuctionOrder.amountToBid,
      amountToBid: initialAuctionOrder.amountToBuy,
    };
  }
}

export async function getAllSellOrders(
  easyAuction: Contract,
): Promise<Order[]> {
  const filterSellOrders = easyAuction.filters.NewSellOrder(
    null,
    null,
    null,
  );
  const logs = await easyAuction.queryFilter(filterSellOrders, 0, "latest");
  const events = logs.map((log: any) => easyAuction.interface.parseLog(log));
  const sellOrders = events.map((x: any) => {
    const order: Order = {
      userId: x.args[0],
      amountToBid: x.args[2],
      amountToBuy: x.args[1],
    };
    return order;
  });

  const filterOrderCancellations = easyAuction.filters.CancellationSellOrder;
  const logsForCancellations = await easyAuction.queryFilter(
    filterOrderCancellations(),
    0,
    "latest",
  );
  const eventsForCancellations = logsForCancellations.map((log: any) =>
    easyAuction.interface.parseLog(log),
  );
  const sellOrdersDeletions = eventsForCancellations.map((x: any) => {
    const order: Order = {
      userId: x.args[0],
      amountToBid: x.args[2],
      amountToBuy: x.args[1],
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
  hre: HardhatRuntimeEnvironment,
): Promise<{ auctioningToken: Contract; biddingToken: Contract }> {
  const ERC20 = await hre.ethers.getContractFactory("ERC20Mintable");
  const biddingToken = await ERC20.deploy("BT", "BT");
  const auctioningToken = await ERC20.deploy("AT", "AT");

  for (const user of users) {
    await biddingToken.mint(user.address, BigNumber.from(10).pow(30));
    await biddingToken
      .connect(user)
      .approve(easyAuction.address, BigNumber.from(10).pow(30));

    await auctioningToken.mint(user.address, BigNumber.from(10).pow(30));
    await auctioningToken
      .connect(user)
      .approve(easyAuction.address, BigNumber.from(10).pow(30));
  }
  return { auctioningToken: auctioningToken, biddingToken: biddingToken };
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
  hre: HardhatRuntimeEnvironment,
): Promise<void> {
  for (const sellOrder of sellOrders) {
    await easyAuction
      .connect(hre.waffle.provider.getWallets()[sellOrder.userId.toNumber() - 1])
      .placeSellOrders(
        [sellOrder.amountToBuy],
        [sellOrder.amountToBid],
        [queueStartElement],
      );
  }
}
