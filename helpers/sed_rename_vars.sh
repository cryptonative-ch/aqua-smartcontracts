#!/bin/bash
# usage sed_rename_1.sh filename
# Naming conventions: https://hackmd.io/l6ZNaX0zQbuNpT9fxAZY-g
# step 1
echo Working on $1

# replace biddingTokenAmount->tokenInAmount
sed -i 's/biddingTokenAmount/tokenInAmount/g' $1
# replace biddingTokenAmount->tokenInAmount
sed -i 's/auctioningTokenAmount/tokenOutAmount/g' $1

# replace biddingToken, but not biddingTokenAmount
sed -ri 's/biddingToken/tokenIn/g' $1
# replace auctioningToken, but not auctioningTokenAmount
sed -ri 's/auctioningToken/tokenOut/g' $1

# replace biddingToken, but not biddingTokenAmount
#sed -ri 's/biddingToken([^A])/tokenIn\1/g' $1
# replace auctioningToken, but not auctioningTokenAmount
#sed -ri 's/auctioningToken([^A])/tokenOut\1/g' $1


# replace biddingTokenAmount->tokenInAmount
sed -i 's/sumBiddingTokenAmount/sumTokenInAmount/g' $1
# replace biddingTokenAmount->tokenInAmount
sed -i 's/sumAuctioningTokenAmount/sumTokenOutAmount/g' $1

sed -i 's/minFundingThreshold/minSellThreshold/g' $1

sed -i 's/amountToSell/totalTokenOutAmount/g' $1

sed -i 's/amountToBuy/orderTokenOut/g' $1
sed -i 's/amountToBid/orderTokenIn/g' $1

sed -i 's/amountsToBuy/ordersTokenOut/g' $1
sed -i 's/amountsToBid/ordersTokenIn/g' $1

sed -i 's/sumOfAmountsToBid/sumOrdersTokenIn/g' $1

sed -i 's/userId/ownerId/g' $1

sed -i 's/auctionEndDate/endDate/g' $1
sed -i 's/auctionStartDate/startDate/g' $1



git diff --color $1 > $1.diff
echo look at the diff with this command:
echo  less -R $1.diff