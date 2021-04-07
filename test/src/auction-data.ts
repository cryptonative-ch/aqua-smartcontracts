import { isAbsolute } from 'path'
import csv from 'csvtojson'

interface AuctionBid {
  addressName: string
  addressIndex: number
  orderTokenIn: number
  orderTokenOut: number
  price: number
}

export const fixFieldTypes = ({ addressIndex, addressName, price, orderTokenIn, orderTokenOut}: AuctionBid): AuctionBid => ({
  addressName,
  price: parseFloat(price.toString()),
  orderTokenIn: parseFloat(orderTokenIn.toString()),
  orderTokenOut: parseFloat(orderTokenIn.toString()) / parseFloat(price.toString()), // may introduce runding error
  addressIndex: parseFloat(addressIndex.toString()),
})

export async function parseAuctionData(csvFilePath: string) {
  console.log(csvFilePath)
  if (!isAbsolute(csvFilePath)) {
    throw new Error('CSV file path must be absolute')
  }

  const auctionBids = await csv().fromFile(csvFilePath)

  return auctionBids.map(fixFieldTypes)
}
