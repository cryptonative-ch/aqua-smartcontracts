import { utils } from 'ethers'

import { BigNumber, BigNumberish } from '@ethersproject/bignumber'
export interface InitDataFairSaleOptions {
  saleLauncher: string
  saleTemplateId: BigNumberish
  tokenOut: string
  tokenIn: string
  auctionEndDate: BigNumberish
  tokenOutSupply: BigNumberish
  minPrice: BigNumber
  minBuyAmount: BigNumber
  minRaise: BigNumber
  tokenSupplier: string
}

export function encodeInitDataFairSale({
  saleLauncher,
  saleTemplateId,
  tokenOut,
  tokenIn,
  auctionEndDate,
  tokenOutSupply,
  minPrice,
  minBuyAmount,
  minRaise,
  tokenSupplier,
}: InitDataFairSaleOptions): string {
  return utils.defaultAbiCoder.encode(
    ['address', 'uint256', 'address', 'address', 'uint256', 'uint256', 'uint96', 'uint96', 'uint256', 'address'],
    [
      saleLauncher,
      saleTemplateId,
      tokenOut,
      tokenIn,
      auctionEndDate,
      tokenOutSupply,
      minPrice,
      minBuyAmount,
      minRaise,
      tokenSupplier,
    ]
  )
}

export interface InitDataFixedPriceSaleOptions {
  saleLauncher: string
  saleTemplateId: BigNumberish
  tokenSupplier: string
  tokenOut: string
  tokenIn: string
  tokenPrice: BigNumberish
  tokensForSale: BigNumberish
  startDate: BigNumberish
  endDate: BigNumberish
  minCommitment: BigNumberish
  maxCommitment: BigNumberish
  minRaise: BigNumberish
  participantList: boolean
}

export function encodeInitDataFixedPriceSale({
  saleLauncher,
  saleTemplateId,
  tokenSupplier,
  tokenIn,
  tokenOut,
  tokenPrice,
  tokensForSale,
  startDate,
  endDate,
  minCommitment,
  maxCommitment,
  minRaise,
  participantList,
}: InitDataFixedPriceSaleOptions): string {
  return utils.defaultAbiCoder.encode(
    [
      'address',
      'uint256',
      'address',
      'address',
      'address',
      'uint256',
      'uint256',
      'uint256',
      'uint256',
      'uint256',
      'uint256',
      'uint256',
      'bool',
    ],
    [
      saleLauncher,
      saleTemplateId,
      tokenSupplier,
      tokenIn,
      tokenOut,
      tokenPrice,
      tokensForSale,
      startDate,
      endDate,
      minCommitment,
      maxCommitment,
      minRaise,
      participantList,
    ]
  )
}
