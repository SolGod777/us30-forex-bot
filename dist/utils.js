"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fallbackSideSelctor = void 0;
const fallbackSideSelctor = (candles, currentPrice) => {
    const closingPrices = candles.map((c) => c.close);
    const movingAverage = closingPrices.reduce((sum, price) => sum + price, 0) / closingPrices.length;
    console.log(`Current: ${currentPrice}, MA: ${movingAverage}`);
    if (currentPrice > movingAverage) {
        return "buy";
    }
    else {
        return "sell";
    }
};
exports.fallbackSideSelctor = fallbackSideSelctor;
