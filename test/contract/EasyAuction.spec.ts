import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import hre, { ethers, waffle } from "hardhat";
import "@nomiclabs/hardhat-ethers";

import {
  toReceivedFunds,
  encodeOrder,
  decodeOrder,
  queueStartElement,
  createTokensAndMintAndApprove,
  placeOrders,
  calculateClearingPrice,
  getAllSellOrders,
  reverseOrderPrice,
} from "../../src/priceCalculation";

import {
  sendTxAndGetReturnValue,
  closeAuction,
  increaseTime,
  claimFromAllOrders,
} from "./utilities";

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Some tests use different test cases 1,..,10. These test cases are illustrated in the following jam board:
// https://jamboard.google.com/d/1DMgMYCQQzsSLKPq_hlK3l32JNBbRdIhsOrLB1oHaEYY/edit?usp=sharing
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("EasyAuction", async () => {
  const [user_1, user_2, user_3] = waffle.provider.getWallets();
  let easyAuction: Contract;
  beforeEach(async () => {
    const EasyAuction = await ethers.getContractFactory("EasyAuction");

    easyAuction = await EasyAuction.deploy();
  });
  describe("initiate Auction", async () => {
    it("throws if minimumBiddingAmountPerOrder is zero", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await expect(
        easyAuction.initAuction(
          auctioningToken.address,
          biddingToken.address,
          60 * 60,
          60 * 60,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("1"),
          0,
          0,
          false,
        ),
      ).to.be.revertedWith(
        "minimumBiddingAmountPerOrder is not allowed to be zero",
      );
    });
    it("throws if auctioned amount is zero", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await expect(
        easyAuction.initAuction(
          auctioningToken.address,
          biddingToken.address,
          60 * 60,
          60 * 60,
          0,
          ethers.utils.parseEther("1"),
          1,
          0,
          false,
        ),
      ).to.be.revertedWith("cannot auction zero tokens");
    });
    it("throws if auction is a giveaway", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await expect(
        easyAuction.initAuction(
          auctioningToken.address,
          biddingToken.address,
          60 * 60,
          60 * 60,
          ethers.utils.parseEther("1"),
          0,
          1,
          0,
          false,
        ),
      ).to.be.revertedWith("tokens cannot be auctioned for free");
    });
    it("throws if auction periods do not make sense", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await expect(
        easyAuction.initAuction(
          auctioningToken.address,
          biddingToken.address,
          60 * 60 + 1,
          60 * 60,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("1"),
          1,
          0,
          false,
        ),
      ).to.be.revertedWith("time periods are not configured correctly");
    });
    it("initAuction stores the parameters correctly", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const timestampForMining = 2000000000;
      ethers.provider.send("evm_setNextBlockTimestamp", [timestampForMining]);
      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("1"),
        1,
        0,
        false,
      );
      expect(await easyAuction.auctioningToken()).to.equal(auctioningToken.address);
      expect(await easyAuction.biddingToken()).to.equal(biddingToken.address);
      expect(await easyAuction.initialAuctionOrder()).to.equal(
        encodeOrder({
          userId: BigNumber.from(1),
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1"),
        }),
      );
      expect(await easyAuction.auctionEndDate()).to.be.equal(timestampForMining + 3600);
      await expect(await easyAuction.clearingPriceOrder()).to.equal(
        encodeOrder({
          userId: BigNumber.from(0),
          sellAmount: ethers.utils.parseEther("0"),
          buyAmount: ethers.utils.parseEther("0"),
        }),
      );
      expect(await easyAuction.volumeClearingPriceOrder()).to.be.equal(0);

      expect(await auctioningToken.balanceOf(easyAuction.address)).to.equal(
        ethers.utils.parseEther("1"),
      );
    });
  });
  describe("getUserId", async () => {
    it("creates new userIds", async () => {
      expect(
        await sendTxAndGetReturnValue(
          easyAuction,
          "getUserId(address)",
          user_1.address,
        ),
      ).to.equal(1);
      expect(
        await sendTxAndGetReturnValue(
          easyAuction,
          "getUserId(address)",
          user_2.address,
        ),
      ).to.equal(2);
      expect(
        await sendTxAndGetReturnValue(
          easyAuction,
          "getUserId(address)",
          user_1.address,
        ),
      ).to.equal(1);
    });
  });
  describe("placeOrders", async () => {
    it("one can not place orders, if auction is not yet initiated", async () => {
      await expect(
        easyAuction.placeSellOrders(
          [ethers.utils.parseEther("1")],
          [ethers.utils.parseEther("1").add(1)],
          [queueStartElement],
        ),
      ).to.be.revertedWith("no longer in order placement phase");
    });
    it("one can not place orders, if auction is over", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );
      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("1"),
        1,
        0,
        false,
      );
      await closeAuction(easyAuction);
      await expect(
        easyAuction.placeSellOrders(
          [ethers.utils.parseEther("1")],
          [ethers.utils.parseEther("1").add(1)],
          [queueStartElement],
        ),
      ).to.be.revertedWith("no longer in order placement phase");
    });
    it("one can not place orders, with a worser or same rate", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );
      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("1"),
        1,
        0,
        false,
      );
      await expect(
        easyAuction.placeSellOrders(
          [ethers.utils.parseEther("1").add(1)],
          [ethers.utils.parseEther("1")],
          [queueStartElement],
        ),
      ).to.be.revertedWith("limit price not better than mimimal offer");
      await expect(
        easyAuction.placeSellOrders(
          [ethers.utils.parseEther("1")],
          [ethers.utils.parseEther("1")],
          [queueStartElement],
        ),
      ).to.be.revertedWith("limit price not better than mimimal offer");
    });
    it("does not withdraw funds, if orders are placed twice", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );
      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("1"),
        1,
        0,
        false,
      );
      await expect(() =>
        easyAuction.placeSellOrders(
          [ethers.utils.parseEther("1").sub(1)],
          [ethers.utils.parseEther("1")],
          [queueStartElement],
        ),
      ).to.changeTokenBalances(
        biddingToken,
        [user_1],
        [ethers.utils.parseEther("-1")],
      );
      await expect(() =>
        easyAuction.placeSellOrders(
          [ethers.utils.parseEther("1").sub(1)],
          [ethers.utils.parseEther("1")],
          [queueStartElement],
        ),
      ).to.changeTokenBalances(biddingToken, [user_1], [BigNumber.from(0)]);
    });
    it("places a new order and checks that tokens were transferred", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );
      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("1"),
        1,
        0,
        false,
      );

      const balanceBeforeOrderPlacement = await biddingToken.balanceOf(
        user_1.address,
      );
      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");

      await easyAuction.placeSellOrders(
        [buyAmount, buyAmount],
        [sellAmount, sellAmount.add(1)],
        [queueStartElement, queueStartElement],
      );
      const transferredbiddingTokenAmount = sellAmount.add(sellAmount.add(1));

      expect(await biddingToken.balanceOf(easyAuction.address)).to.equal(
        transferredbiddingTokenAmount,
      );
      expect(await biddingToken.balanceOf(user_1.address)).to.equal(
        balanceBeforeOrderPlacement.sub(transferredbiddingTokenAmount),
      );
    });
    it("throws, if DDOS attack with small order amounts is started", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(5000),
          buyAmount: ethers.utils.parseEther("1").div(10000),
          userId: BigNumber.from(0),
        },
      ];

      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        ethers.utils.parseEther("1").div(100),
        0,
        false,
      );
      await expect(
        easyAuction.placeSellOrders(
          sellOrders.map((buyOrder) => buyOrder.buyAmount),
          sellOrders.map((buyOrder) => buyOrder.sellAmount),
          Array(sellOrders.length).fill(queueStartElement),
        ),
      ).to.be.revertedWith("order too small");
    });
    it("fails, if transfers are failing", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );
      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("1"),
        1,
        0,
        false,
      );
      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");
      await biddingToken.approve(
        easyAuction.address,
        ethers.utils.parseEther("0"),
      );

      await expect(
        easyAuction.placeSellOrders(
          [buyAmount, buyAmount],
          [sellAmount, sellAmount.add(1)],
          [queueStartElement, queueStartElement],
        ),
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
  });
  describe("precalculateSellAmountSum", async () => {
    it("fails if too many orders are considered", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);
      await closeAuction(easyAuction);
      await expect(
        easyAuction.precalculateSellAmountSum(3),
      ).to.be.revertedWith("too many orders summed up");
    });
    it("fails if queue end is reached", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await closeAuction(easyAuction);
      await expect(
        easyAuction.precalculateSellAmountSum(2),
      ).to.be.revertedWith("reached end of order list");
    });
    it("verifies that interimSumBidAmount and iterOrder is set correctly", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(2),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);
      await closeAuction(easyAuction);

      await easyAuction.precalculateSellAmountSum(1);
      expect(await easyAuction.interimSumBidAmount()).to.equal(
        sellOrders[0].sellAmount,
      );

      expect(await easyAuction.interimOrder()).to.equal(encodeOrder(sellOrders[0]));
    });
    it("verifies that interimSumBidAmount and iterOrder takes correct starting values by applying twice", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(10),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(10),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);
      await closeAuction(easyAuction);

      await easyAuction.precalculateSellAmountSum(1);
      await easyAuction.precalculateSellAmountSum(1);
      expect(await easyAuction.interimSumBidAmount()).to.equal(
        sellOrders[0].sellAmount.add(sellOrders[0].sellAmount),
      );

      expect(await easyAuction.interimOrder()).to.equal(encodeOrder(sellOrders[1]));
    });
  });
  describe("settleAuction", async () => {
    it("checks case 4, it verifies the price in case of clearing order == initialAuctionOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(10),
          buyAmount: ethers.utils.parseEther("1").div(20),
          userId: BigNumber.from(1),
        },
      ];

      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await easyAuction.initAuction(
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      const price = await calculateClearingPrice(easyAuction);
      await easyAuction.settleAuction();
      
      expect(await easyAuction.clearingPriceOrder()).to.equal(encodeOrder(price));
      expect(await easyAuction.volumeClearingPriceOrder()).to.equal(
        sellOrders[0].sellAmount, // times prices (=1)
      );
    });
    it("checks case 4, it verifies the price in case of clearingOrder == initialAuctionOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("5"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.1"),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await easyAuction.initAuction(
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);

      const price = await calculateClearingPrice(easyAuction);
      await easyAuction.settleAuction();
      
      expect(await easyAuction.clearingPriceOrder()).to.equal(encodeOrder(price));
      expect(await easyAuction.volumeClearingPriceOrder()).to.equal(
        sellOrders[0].sellAmount.mul(price.buyAmount).div(price.sellAmount),
      );
      await claimFromAllOrders(easyAuction, sellOrders);
    });
    it("checks case 4, it verifies the price in case of clearingOrder == initialAuctionOrder with 3 orders", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("2"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.1"),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.1"),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.1"),
          userId: BigNumber.from(3),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, user_3],
        hre,
      );

      await easyAuction.initAuction(
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);

      await easyAuction.settleAuction();
      
      expect(await easyAuction.clearingPriceOrder()).to.equal(
        encodeOrder(reverseOrderPrice(initialAuctionOrder)),
      );
      const price = decodeOrder(await easyAuction.clearingPriceOrder());
      expect(await easyAuction.volumeClearingPriceOrder()).to.equal(
        sellOrders[0].sellAmount
          .mul(3)
          .mul(price.buyAmount)
          .div(price.sellAmount),
      );
      await claimFromAllOrders(easyAuction, sellOrders);
    });
    it("checks case 6, it verifies the price in case of clearingOrder == initialOrder, although last iterOrder would also be possible", async () => {
      // This test demonstrates the case 6,
      // where price could be either the auctioningOrder or sellOrder
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("500"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await easyAuction.initAuction(
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);

      await easyAuction.settleAuction();
      
      expect(await easyAuction.clearingPriceOrder()).to.equal(
        encodeOrder(reverseOrderPrice(initialAuctionOrder)),
      );
      expect(await easyAuction.volumeClearingPriceOrder()).to.equal(
        initialAuctionOrder.sellAmount,
      );
      await easyAuction.claimFromParticipantOrder(
        sellOrders.map((order) => encodeOrder(order)),
      );
    });
    it("checks case 3, it verifies the price in case of clearingOrder != placed order with 3x participation", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("500"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(3),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(2),
        },
      ];

      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, user_3],
        hre,
      );

      await easyAuction.initAuction(
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);

      await easyAuction.settleAuction();
      
      expect(await easyAuction.clearingPriceOrder()).to.equal(
        encodeOrder({
          sellAmount: ethers.utils.parseEther("3"),
          buyAmount: initialAuctionOrder.sellAmount,
          userId: BigNumber.from(0),
        }),
      );
      expect(await easyAuction.volumeClearingPriceOrder()).to.equal(0);
      await claimFromAllOrders(easyAuction, sellOrders);
    });
    it("checks case 8, it verifies the price in case of no participation of the auction", async () => {
      const initialAuctionOrder = {
        sellAmount: BigNumber.from(1000),
        buyAmount: BigNumber.from(1000),
        userId: BigNumber.from(0),
      };

      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await easyAuction.initAuction(
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      

      await increaseTime(3601);

      await easyAuction.settleAuction();
      
      expect(await easyAuction.clearingPriceOrder()).to.equal(
        encodeOrder(reverseOrderPrice(initialAuctionOrder)),
      );
      expect(await easyAuction.volumeClearingPriceOrder()).to.equal(BigNumber.from(0));
    });
    it("checks case 2, it verifies the price in case without a partially filled order", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").add(1),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      await easyAuction.settleAuction();
      expect(await easyAuction.clearingPriceOrder()).to.equal(
        encodeOrder({
          sellAmount: sellOrders[0].sellAmount,
          buyAmount: initialAuctionOrder.sellAmount,
          userId: BigNumber.from(0),
        }),
      );
      expect(await easyAuction.volumeClearingPriceOrder()).to.equal(0);
      await claimFromAllOrders(easyAuction, sellOrders);
    });
    it("checks case 10, verifies the price in case one sellOrder is eating initialAuctionOrder completely", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(20),
          buyAmount: ethers.utils.parseEther("1").mul(10),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      await easyAuction.settleAuction();
      
      expect(await easyAuction.clearingPriceOrder()).to.equal(
        encodeOrder(sellOrders[0]),
      );
      expect(await easyAuction.volumeClearingPriceOrder()).to.equal(
        initialAuctionOrder.sellAmount
          .mul(sellOrders[0].sellAmount)
          .div(sellOrders[0].buyAmount),
      );
      await claimFromAllOrders(easyAuction, sellOrders);
    });
    it("checks case 5, bidding amount matches min buyAmount of initialOrder perfectly", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(3),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, user_3],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      await easyAuction.settleAuction();
      
      expect(await easyAuction.clearingPriceOrder()).to.eql(encodeOrder(sellOrders[1]));
      expect(await easyAuction.volumeClearingPriceOrder()).to.equal(
        sellOrders[1].sellAmount,
      );
      await expect(() =>
        easyAuction.claimFromParticipantOrder([
          encodeOrder(sellOrders[0]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_2],
        [sellOrders[0].sellAmount],
      );
      await expect(() =>
        easyAuction.claimFromParticipantOrder([
          encodeOrder(sellOrders[1]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_3],
        [sellOrders[1].sellAmount],
      );
    });
    it("checks case 7, bidding amount matches min buyAmount of initialOrder perfectly with additional order", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.6"),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, user_3],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      await easyAuction.settleAuction();
      
      expect(await easyAuction.clearingPriceOrder()).to.eql(encodeOrder(sellOrders[1]));
      expect(await easyAuction.volumeClearingPriceOrder()).to.equal(
        sellOrders[1].sellAmount,
      );
      await expect(() =>
        easyAuction.claimFromParticipantOrder([
          encodeOrder(sellOrders[0]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_2],
        [sellOrders[0].sellAmount],
      );
      await expect(() =>
        easyAuction.claimFromParticipantOrder([
          encodeOrder(sellOrders[1]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_3],
        [sellOrders[1].sellAmount],
      );
      await expect(() =>
        easyAuction.claimFromParticipantOrder([
          encodeOrder(sellOrders[2]),
        ]),
      ).to.changeTokenBalances(
        biddingToken,
        [user_3],
        [sellOrders[2].sellAmount],
      );
    });
    it("checks case 10: it shows an example why userId should always be given: 2 orders with the same price", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(3),
        },
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.4"),
          userId: BigNumber.from(3),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, user_3],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      await easyAuction.settleAuction();
      
      expect(await easyAuction.clearingPriceOrder()).to.equal(
        encodeOrder(sellOrders[0]),
      );
      expect(await easyAuction.volumeClearingPriceOrder()).to.equal(
        sellOrders[1].sellAmount,
      );
      await expect(() =>
        easyAuction.claimFromParticipantOrder([
          encodeOrder(sellOrders[0]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_2],
        [sellOrders[0].sellAmount],
      );
      await expect(() =>
        easyAuction.claimFromParticipantOrder([
          encodeOrder(sellOrders[1]),
        ]),
      ).to.changeTokenBalances(
        biddingToken,
        [user_3],
        [sellOrders[1].sellAmount],
      );
      await expect(() =>
        easyAuction.claimFromParticipantOrder([
          encodeOrder(sellOrders[2]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_3],
        [sellOrders[2].sellAmount],
      );
    });
    it("checks case 1, it verifies the price in case of 2 of 3 sellOrders eating initialAuctionOrder completely", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      await easyAuction.settleAuction();
      
      expect(await easyAuction.clearingPriceOrder()).to.eql(encodeOrder(sellOrders[1]));
      expect(await easyAuction.volumeClearingPriceOrder()).to.equal(0);
      await claimFromAllOrders(easyAuction, sellOrders);
    });
    it("verifies the price in case of 2 of 3 sellOrders eating initialAuctionOrder completely - with precalculateSellAmountSum step", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      // this is the additional step
      await easyAuction.precalculateSellAmountSum(1);

      await easyAuction.settleAuction();
      
      expect(await easyAuction.clearingPriceOrder()).to.eql(encodeOrder(sellOrders[1]));
      expect(await easyAuction.volumeClearingPriceOrder()).to.equal(0);
    });
    it("verifies the price in case of 2 of 4 sellOrders eating initialAuctionOrder completely - with precalculateSellAmountSum step and one more step within settleAuction", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      // this is the additional step
      await easyAuction.precalculateSellAmountSum(1);

      
      expect(await easyAuction.interimSumBidAmount()).to.equal(
        sellOrders[0].sellAmount,
      );
      expect(await easyAuction.interimOrder()).to.equal(encodeOrder(sellOrders[0]));
      await easyAuction.settleAuction();

      expect(await easyAuction.clearingPriceOrder()).to.eql(
        encodeOrder(sellOrders[2]),
      );
      expect(await easyAuction.volumeClearingPriceOrder()).to.equal(0);
      await claimFromAllOrders(easyAuction, sellOrders);
    });
    it("verifies the price in case of clearing order is decided by userId", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      await easyAuction.settleAuction();
      
      expect(await easyAuction.clearingPriceOrder()).to.be.equal(
        encodeOrder(sellOrders[1]),
      );
      expect(await easyAuction.volumeClearingPriceOrder()).to.equal(0);
      await claimFromAllOrders(easyAuction, sellOrders);
    });
    it("simple version of e2e gas test", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(4),
          buyAmount: ethers.utils.parseEther("1").div(8),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").div(4),
          buyAmount: ethers.utils.parseEther("1").div(12),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").div(4),
          buyAmount: ethers.utils.parseEther("1").div(16),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").div(4),
          buyAmount: ethers.utils.parseEther("1").div(20),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      const price = await calculateClearingPrice(easyAuction);

      await easyAuction.settleAuction();
      expect(price).to.eql(initialAuctionOrder);
      
      expect(await easyAuction.clearingPriceOrder()).to.equal(
        encodeOrder(reverseOrderPrice(initialAuctionOrder)),
      );
      expect(await easyAuction.volumeClearingPriceOrder()).to.equal(
        initialAuctionOrder.sellAmount,
      );
      await claimFromAllOrders(easyAuction, sellOrders);
    });
    it("checks whether the minimalFundingThreshold is not met", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("10"),
        buyAmount: ethers.utils.parseEther("10"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(4),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        ethers.utils.parseEther("5"),
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      const price = await calculateClearingPrice(easyAuction);

      await easyAuction.settleAuction();
      expect(price).to.eql(initialAuctionOrder);
      
      expect(await easyAuction.minFundingThresholdNotReached()).to.equal(true);
    });
  });
  describe("claimFromAuctioneerOrder", async () => {
    it("checks that auctioneer receives all their auctioningTokens back if minFundingThreshold was not met", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("10"),
        buyAmount: ethers.utils.parseEther("10"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(4),
          userId: BigNumber.from(3),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, user_3],
        hre,
      );
      const auctioningTokenBalanceBeforeAuction = await auctioningToken.balanceOf(
        user_1.address,
      );
      const feeReceiver = user_3;
      const feeNumerator = 10;
      await easyAuction
        .connect(user_1)
        .setFeeParameters(feeNumerator, feeReceiver.address);
      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        ethers.utils.parseEther("5"),
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);
      await increaseTime(3601);
      await easyAuction.settleAuction();
      
      expect(await easyAuction.minFundingThresholdNotReached()).to.equal(true);
      expect(await auctioningToken.balanceOf(user_1.address)).to.be.equal(
        auctioningTokenBalanceBeforeAuction,
      );
    });
    it("checks the claimed amounts for a fully matched initialAuctionOrder and buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").add(1),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      const price = await calculateClearingPrice(easyAuction);
      const callPromise = easyAuction.settleAuction();
      // auctioneer reward check:
      await expect(() => callPromise).to.changeTokenBalances(
        auctioningToken,
        [user_1],
        [0],
      );
      await expect(callPromise)
        .to.emit(biddingToken, "Transfer")
        .withArgs(easyAuction.address, user_1.address, price.sellAmount);
    });
    it("checks the claimed amounts for a partially matched initialAuctionOrder and buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      const callPromise = easyAuction.settleAuction();
      // auctioneer reward check:
      await expect(callPromise)
        .to.emit(auctioningToken, "Transfer")
        .withArgs(
          easyAuction.address,
          user_1.address,
          initialAuctionOrder.sellAmount.sub(sellOrders[0].sellAmount),
        );
      await expect(callPromise)
        .to.emit(biddingToken, "Transfer")
        .withArgs(
          easyAuction.address,
          user_1.address,
          sellOrders[0].sellAmount,
        );
    });
  });
  describe("claimFromParticipantOrder", async () => {
    it("checks that participant receives all their biddingTokens back if minFundingThreshold was not met", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("10"),
        buyAmount: ethers.utils.parseEther("10"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(4),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        ethers.utils.parseEther("5"),
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      await easyAuction.settleAuction();
      await expect(() =>
        easyAuction.claimFromParticipantOrder(
          sellOrders.map((order) => encodeOrder(order)),
        ),
      ).to.changeTokenBalances(
        biddingToken,
        [user_2],
        [sellOrders[0].sellAmount.add(sellOrders[1].sellAmount)],
      );
    });
    it("checks that claiming only works after the finishing of the auction", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").add(1),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await expect(
        easyAuction.claimFromParticipantOrder(
          sellOrders.map((order) => encodeOrder(order)),
        ),
      ).to.be.revertedWith("Auction not yet finished");
      await increaseTime(3601);
      await expect(
        easyAuction.claimFromParticipantOrder(
          sellOrders.map((order) => encodeOrder(order)),
        ),
      ).to.be.revertedWith("Auction not yet finished");
    });
    it("checks the claimed amounts for a partially matched buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      const price = await calculateClearingPrice(easyAuction);
      await easyAuction.settleAuction();

      const receivedAmounts = toReceivedFunds(
        await easyAuction.callStatic.claimFromParticipantOrder([
          encodeOrder(sellOrders[1]),
        ]),
      );
      const settledBuyAmount = sellOrders[1].sellAmount
        .mul(price.buyAmount)
        .div(price.sellAmount)
        .sub(
          sellOrders[0].sellAmount
            .add(sellOrders[1].sellAmount)
            .mul(price.buyAmount)
            .div(price.sellAmount)
            .sub(initialAuctionOrder.sellAmount),
        )
        .sub(1);
      expect(receivedAmounts.auctioningTokenAmount).to.equal(settledBuyAmount);
      expect(receivedAmounts.biddingTokenAmount).to.equal(
        sellOrders[1].sellAmount
          .sub(settledBuyAmount.mul(price.sellAmount).div(price.buyAmount))
          .sub(1),
      );
    });
    it("checks the claimed amounts for a fully not-matched buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);
      await increaseTime(3601);
      await easyAuction.settleAuction();
      const receivedAmounts = toReceivedFunds(
        await easyAuction.callStatic.claimFromParticipantOrder([
          encodeOrder(sellOrders[2]),
        ]),
      );
      expect(receivedAmounts.biddingTokenAmount).to.equal(
        sellOrders[2].sellAmount,
      );
      expect(receivedAmounts.auctioningTokenAmount).to.equal("0");
    });
    it("checks the claimed amounts for a fully matched buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      const price = await calculateClearingPrice(easyAuction);
      await easyAuction.settleAuction();

      const receivedAmounts = toReceivedFunds(
        await easyAuction.callStatic.claimFromParticipantOrder([
          encodeOrder(sellOrders[0]),
        ]),
      );
      expect(receivedAmounts.biddingTokenAmount).to.equal("0");
      expect(receivedAmounts.auctioningTokenAmount).to.equal(
        sellOrders[0].sellAmount.mul(price.buyAmount).div(price.sellAmount),
      );
    });
    it("checks that an order can not be used for claiming twice", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      await easyAuction.settleAuction();
      await easyAuction.claimFromParticipantOrder([
        encodeOrder(sellOrders[0]),
      ]),
        await expect(
          easyAuction.claimFromParticipantOrder([
            encodeOrder(sellOrders[0]),
          ]),
        ).to.be.revertedWith("order is no longer claimable");
    });
  });
  it("checks that orders from different users can not be claimed at once", async () => {
    const initialAuctionOrder = {
      sellAmount: ethers.utils.parseEther("1"),
      buyAmount: ethers.utils.parseEther("1"),
      userId: BigNumber.from(0),
    };
    const sellOrders = [
      {
        sellAmount: ethers.utils.parseEther("1").div(2).add(1),
        buyAmount: ethers.utils.parseEther("1").div(2),
        userId: BigNumber.from(1),
      },
      {
        sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
        buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
        userId: BigNumber.from(2),
      },
    ];
    const {
      auctioningToken,
      biddingToken,
    } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2], hre);

    console
    await sendTxAndGetReturnValue(
      easyAuction,
      "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
      auctioningToken.address,
      biddingToken.address,
      60 * 60,
      60 * 60,
      initialAuctionOrder.sellAmount,
      initialAuctionOrder.buyAmount,
      1,
      0,
      false,
    );
    await placeOrders(easyAuction, sellOrders, hre);

    await increaseTime(3601);
    await easyAuction.settleAuction();
    await expect(
      easyAuction.claimFromParticipantOrder([
        encodeOrder(sellOrders[0]),
        encodeOrder(sellOrders[1]),
      ]),
    ).to.be.revertedWith("only allowed to claim for same user");
  });
  it("checks the claimed amounts are summed up correctly for two orders", async () => {
    const initialAuctionOrder = {
      sellAmount: ethers.utils.parseEther("1"),
      buyAmount: ethers.utils.parseEther("1"),
      userId: BigNumber.from(0),
    };
    const sellOrders = [
      {
        sellAmount: ethers.utils.parseEther("1").div(2).add(1),
        buyAmount: ethers.utils.parseEther("1").div(2),
        userId: BigNumber.from(1),
      },
      {
        sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
        buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
        userId: BigNumber.from(1),
      },
    ];
    const {
      auctioningToken,
      biddingToken,
    } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2], hre);

    await sendTxAndGetReturnValue(
      easyAuction,
      "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
      auctioningToken.address,
      biddingToken.address,
      60 * 60,
      60 * 60,
      initialAuctionOrder.sellAmount,
      initialAuctionOrder.buyAmount,
      1,
      0,
      false,
    );
    await placeOrders(easyAuction, sellOrders, hre);

    await increaseTime(3601);
    const price = await calculateClearingPrice(easyAuction);
    await easyAuction.settleAuction();

    const receivedAmounts = toReceivedFunds(
      await easyAuction.callStatic.claimFromParticipantOrder([
        encodeOrder(sellOrders[0]),
        encodeOrder(sellOrders[1]),
      ]),
    );
    expect(receivedAmounts.biddingTokenAmount).to.equal(
      sellOrders[0].sellAmount
        .add(sellOrders[1].sellAmount)
        .sub(
          initialAuctionOrder.sellAmount
            .mul(price.sellAmount)
            .div(price.buyAmount),
        ),
    );
    expect(receivedAmounts.auctioningTokenAmount).to.equal(
      initialAuctionOrder.sellAmount.sub(1),
    );
  });
  describe("settleAuctionAtomically", async () => {
    it("can not settle atomically, if it is not allowed", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(1),
        },
      ];
      const atomicSellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.499"),
          buyAmount: ethers.utils.parseEther("0.4999"),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      await expect(
        easyAuction.settleAuctionAtomically(
          [atomicSellOrders[0].sellAmount],
          [atomicSellOrders[0].buyAmount],
          [queueStartElement],
        ),
      ).to.be.revertedWith("not allowed to settle auction atomically");
    });
    it("can settle atomically, if it is allowed", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(1),
        },
      ];
      const atomicSellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.4999"),
          buyAmount: ethers.utils.parseEther("0.4999"),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        true,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      await easyAuction
        .connect(user_2)
        .settleAuctionAtomically(
          [atomicSellOrders[0].sellAmount],
          [atomicSellOrders[0].buyAmount],
          [queueStartElement],
        );
      
      expect(await easyAuction.clearingPriceOrder()).to.equal(
        encodeOrder({
          sellAmount: sellOrders[0].sellAmount.add(
            atomicSellOrders[0].sellAmount,
          ),
          buyAmount: initialAuctionOrder.sellAmount,
          userId: BigNumber.from(0),
        }),
      );
    });
    it("can not settle auctions atomically, before auction finished", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(1),
        },
      ];
      const atomicSellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.4999"),
          buyAmount: ethers.utils.parseEther("0.4999"),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        true,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await expect(
        easyAuction
          .connect(user_2)
          .settleAuctionAtomically(
            [atomicSellOrders[0].sellAmount],
            [atomicSellOrders[0].buyAmount],
            [queueStartElement],
          ),
      ).to.be.revertedWith("Auction not in solution submission phase");
    });
  });
  describe("registerUser", async () => {
    it("registers a user only once", async () => {
      await easyAuction.registerUser(user_1.address);
      await expect(easyAuction.registerUser(user_1.address)).to.be.revertedWith(
        "User already registered",
      );
    });
  });
  describe("cancelOrder", async () => {
    it("cancels an order", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await expect(
        easyAuction.cancelSellOrders([encodeOrder(sellOrders[0])]),
      )
        .to.emit(biddingToken, "Transfer")
        .withArgs(
          easyAuction.address,
          user_1.address,
          sellOrders[0].sellAmount,
        );
    });
    it("does not allow to cancel a order, if it is too late", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      await expect(
        easyAuction.cancelSellOrders([encodeOrder(sellOrders[0])]),
      ).to.be.revertedWith(
        "revert no longer in order placement and cancelation phase",
      );
      await increaseTime(3601);
      await expect(
        easyAuction.cancelSellOrders([encodeOrder(sellOrders[0])]),
      ).to.be.revertedWith(
        "revert no longer in order placement and cancelation phase",
      );
    });
    it("can't cancel orders twice", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      // removes the order
      easyAuction.cancelSellOrders([encodeOrder(sellOrders[0])]);
      // claims 0 sellAmount tokens
      await expect(
        easyAuction.cancelSellOrders([encodeOrder(sellOrders[0])]),
      )
        .to.emit(biddingToken, "Transfer")
        .withArgs(easyAuction.address, user_1.address, 0);
    });
    it("prevents an order from canceling, if tx is not from owner", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await expect(
        easyAuction.cancelSellOrders([encodeOrder(sellOrders[0])]),
      ).to.be.revertedWith("Only the user can cancel his orders");
    });
  });

  describe("containsOrder", async () => {
    it("returns true, if it contains order", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);

      await increaseTime(3601);
      expect(
        await easyAuction.callStatic.containsOrder(
          encodeOrder(sellOrders[0]),
        ),
      ).to.be.equal(true);
    });
  });
  describe("getSecondsRemainingInBatch", async () => {
    it("checks that claiming only works after the finishing of the auction", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await increaseTime(3601);
      expect(
        await easyAuction.callStatic.getSecondsRemainingInBatch(),
      ).to.be.equal("0");
    });
  });
  describe("claimsFee", async () => {
    it("claims fees fully for a non-partially filled initialAuctionOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      let sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, user_3],
        hre,
      );

      const feeReceiver = user_3;
      const feeNumerator = 10;
      await easyAuction
        .connect(user_1)
        .setFeeParameters(feeNumerator, feeReceiver.address);

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);
      // resets the userId, as they are only given during function call.
      sellOrders = await getAllSellOrders(easyAuction);

      await increaseTime(3601);
      await expect(() =>
        easyAuction.settleAuction(),
      ).to.changeTokenBalances(
        auctioningToken,
        [feeReceiver],
        [initialAuctionOrder.sellAmount.mul(feeNumerator).div("1000")],
      );

      // contract still holds sufficient funds to pay the participants fully
      await easyAuction.callStatic.claimFromParticipantOrder(
        sellOrders.map((order) => encodeOrder(order)),
      );
    });
    it("claims also fee amount of zero, even when it is changed later", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      let sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, user_3],
        hre,
      );

      const feeReceiver = user_3;
      const feeNumerator = 0;
      await easyAuction
        .connect(user_1)
        .setFeeParameters(feeNumerator, feeReceiver.address);

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);
      // resets the userId, as they are only given during function call.
      sellOrders = await getAllSellOrders(easyAuction);
      await easyAuction
        .connect(user_1)
        .setFeeParameters(10, feeReceiver.address);

      await increaseTime(3601);
      await expect(() =>
        easyAuction.settleAuction(),
      ).to.changeTokenBalances(
        auctioningToken,
        [feeReceiver],
        [BigNumber.from(0)],
      );

      // contract still holds sufficient funds to pay the participants fully
      await easyAuction.callStatic.claimFromParticipantOrder(
        sellOrders.map((order) => encodeOrder(order)),
      );
    });
    it("claims fees fully for a partially filled initialAuctionOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      let sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2),
          buyAmount: ethers.utils.parseEther("1").div(2).sub(1),
          userId: BigNumber.from(3),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, user_3],
        hre,
      );

      const feeReceiver = user_3;
      const feeNumerator = 10;
      await easyAuction
        .connect(user_1)
        .setFeeParameters(feeNumerator, feeReceiver.address);

      await sendTxAndGetReturnValue(
        easyAuction,
        "initAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool)",
        auctioningToken.address,
        biddingToken.address,
        60 * 60,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
        0,
        false,
      );
      await placeOrders(easyAuction, sellOrders, hre);
      // resets the userId, as they are only given during function call.
      sellOrders = await getAllSellOrders(easyAuction);

      await increaseTime(3601);
      await expect(() =>
        easyAuction.settleAuction(),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_1, feeReceiver],
        [
          // since only halve of the tokens were sold, he is getting halve of the tokens plus halve of the fee back
          initialAuctionOrder.sellAmount
            .div(2)
            .add(
              initialAuctionOrder.sellAmount
                .mul(feeNumerator)
                .div("1000")
                .div(2),
            ),
          initialAuctionOrder.sellAmount.mul(feeNumerator).div("1000").div(2),
        ],
      );
      // contract still holds sufficient funds to pay the participants fully
      await easyAuction.callStatic.claimFromParticipantOrder(
        sellOrders.map((order) => encodeOrder(order)),
      );
    });
  });
  describe("setFeeParameters", async () => {
    it("can only be called by owner", async () => {
      const feeReceiver = user_3;
      const feeNumerator = 10;
      await expect(
        easyAuction
          .connect(user_2)
          .setFeeParameters(feeNumerator, feeReceiver.address),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("does not allow fees higher than 1.5%", async () => {
      const feeReceiver = user_3;
      const feeNumerator = 16;
      await expect(
        easyAuction
          .connect(user_1)
          .setFeeParameters(feeNumerator, feeReceiver.address),
      ).to.be.revertedWith("Fee is not allowed to be set higher than 1.5%");
    });
  });
});
