import { MetatraderCandle } from "metaapi.cloud-sdk";

export const fallbackSideSelctor = (
  candles: MetatraderCandle[],
  currentPrice: number
) => {
  const closingPrices = candles.map((c) => c.close);
  const movingAverage =
    closingPrices.reduce((sum, price) => sum + price, 0) / closingPrices.length;

  console.log(`Current: ${currentPrice}, MA: ${movingAverage}`);

  if (currentPrice > movingAverage) {
    return "buy";
  } else {
    return "sell";
  }
};
