import { RpcMetaApiConnectionInstance } from "metaapi.cloud-sdk";

// === TRAILING MODES ===

enum TrailingProfile {
  Conservative = "Conservative",
  Balanced = "Balanced",
  Aggressive = "Aggressive",
}

// Choose your profile here:
const selectedProfile: TrailingProfile = TrailingProfile.Balanced;

const calculateTrailingDistance = (
  profit: number,
  profileType: TrailingProfile
) => {
  switch (profileType) {
    case TrailingProfile.Conservative:
      if (profit >= 150) return 10;
      if (profit >= 100) return 15;
      if (profit >= 50) return 20;
      return 25;

    case TrailingProfile.Balanced:
      if (profit >= 150) return 5;
      if (profit >= 100) return 10;
      if (profit >= 50) return 15;
      return 20;

    case TrailingProfile.Aggressive:
      if (profit >= 100) return 5;
      if (profit >= 50) return 10;
      return 15;

    default:
      return 20;
  }
};

export const manageTrailingStop = async (
  connection: RpcMetaApiConnectionInstance,
  symbol = "US30",
  trailingTrigger: number
) => {
  const positions = await connection.getPositions();
  const us30Positions = positions.filter((p) => p.symbol === symbol);

  for (const pos of us30Positions) {
    const price = await connection.getSymbolPrice(symbol, false);
    const currentPrice = pos.type === "BUY" ? price.bid : price.ask;
    const entryPrice = pos.openPrice;
    const profit =
      pos.type === "BUY"
        ? currentPrice - entryPrice
        : entryPrice - currentPrice;

    if (profit >= trailingTrigger) {
      const dynamicTrailing = calculateTrailingDistance(
        profit,
        selectedProfile
      );
      let newStopLoss: number;

      if (pos.type === "BUY") {
        newStopLoss = currentPrice - dynamicTrailing;
        if (newStopLoss > (pos.stopLoss ?? 0)) {
          console.log(
            `Updating BUY stop loss from ${pos.stopLoss} to ${newStopLoss}`
          );
          await connection.modifyPosition(
            pos.id.toString(),
            newStopLoss,
            pos.takeProfit
          );
        }
      } else if (pos.type === "SELL") {
        newStopLoss = currentPrice + dynamicTrailing;
        if (pos.stopLoss == null || newStopLoss < pos.stopLoss) {
          console.log(
            `Updating SELL stop loss from ${pos.stopLoss} to ${newStopLoss}`
          );
          await connection.modifyPosition(
            pos.id.toString(),
            newStopLoss,
            pos.takeProfit
          );
        }
      }
    }
  }
};
