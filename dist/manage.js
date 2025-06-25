"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.manageTrailingStop = void 0;
// === TRAILING MODES ===
var TrailingProfile;
(function (TrailingProfile) {
    TrailingProfile["Conservative"] = "Conservative";
    TrailingProfile["Balanced"] = "Balanced";
    TrailingProfile["Aggressive"] = "Aggressive";
})(TrailingProfile || (TrailingProfile = {}));
// Choose your profile here:
const selectedProfile = TrailingProfile.Balanced;
const calculateTrailingDistance = (profit, profileType) => {
    switch (profileType) {
        case TrailingProfile.Conservative:
            if (profit >= 150)
                return 10;
            if (profit >= 100)
                return 15;
            if (profit >= 50)
                return 20;
            return 25;
        case TrailingProfile.Balanced:
            if (profit >= 150)
                return 5;
            if (profit >= 100)
                return 10;
            if (profit >= 50)
                return 15;
            return 20;
        case TrailingProfile.Aggressive:
            if (profit >= 100)
                return 5;
            if (profit >= 50)
                return 10;
            return 15;
        default:
            return 20;
    }
};
const manageTrailingStop = async (connection, symbol = "US30", trailingTrigger) => {
    const positions = await connection.getPositions();
    const us30Positions = positions.filter((p) => p.symbol === symbol);
    for (const pos of us30Positions) {
        const price = await connection.getSymbolPrice(symbol, false);
        const currentPrice = pos.type === "BUY" ? price.bid : price.ask;
        const entryPrice = pos.openPrice;
        const profit = pos.type === "BUY"
            ? currentPrice - entryPrice
            : entryPrice - currentPrice;
        if (profit >= trailingTrigger) {
            const dynamicTrailing = calculateTrailingDistance(profit, selectedProfile);
            let newStopLoss;
            if (pos.type === "BUY") {
                newStopLoss = currentPrice - dynamicTrailing;
                if (newStopLoss > (pos.stopLoss ?? 0)) {
                    console.log(`Updating BUY stop loss from ${pos.stopLoss} to ${newStopLoss}`);
                    await connection.modifyPosition(pos.id.toString(), newStopLoss, pos.takeProfit);
                }
            }
            else if (pos.type === "SELL") {
                newStopLoss = currentPrice + dynamicTrailing;
                if (pos.stopLoss == null || newStopLoss < pos.stopLoss) {
                    console.log(`Updating SELL stop loss from ${pos.stopLoss} to ${newStopLoss}`);
                    await connection.modifyPosition(pos.id.toString(), newStopLoss, pos.takeProfit);
                }
            }
        }
    }
};
exports.manageTrailingStop = manageTrailingStop;
