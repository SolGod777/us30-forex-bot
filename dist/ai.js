"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.askAi = void 0;
exports.buildPrompt = buildPrompt;
const axios_1 = __importDefault(require("axios"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const OPEN_AI_KEY = process.env.OPEN_AI_KEY;
const askAi = async (prompt) => {
    const response = await axios_1.default.post("https://api.openai.com/v1/chat/completions", {
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
    }, {
        headers: {
            Authorization: `Bearer ${OPEN_AI_KEY}`,
            "Content-Type": "application/json",
        },
    });
    let reply = response.data.choices[0].message.content;
    console.log("GPT response:\n" + reply);
    // ✅ Remove Markdown code block if present
    if (reply.startsWith("```")) {
        reply = reply
            .replace(/```(?:json)?/gi, "")
            .replace(/```$/, "")
            .trim();
    }
    try {
        const parsed = JSON.parse(reply || "{}");
        const side = parsed.side?.toLowerCase();
        const stopLoss = typeof parsed.stop_loss === "number" ? parsed.stop_loss : undefined;
        const takeProfit = typeof parsed.take_profit === "number" ? parsed.take_profit : undefined;
        return { side, stopLoss, takeProfit };
    }
    catch (e) {
        console.error("Failed to parse GPT response as JSON", e);
        throw new Error(`GPT error: ${e}`);
    }
};
exports.askAi = askAi;
const technicalindicators_1 = require("technicalindicators");
function buildPrompt(candles
// slDistance: number,
// tpDistance: number
) {
    if (candles.length < 200) {
        throw new Error("Need at least 200 candles");
    }
    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const rsi = technicalindicators_1.RSI.calculate({ period: 14, values: closes }).slice(-1)[0];
    const stoch = technicalindicators_1.Stochastic.calculate({
        period: 14,
        signalPeriod: 3,
        high: highs,
        low: lows,
        close: closes,
    }).slice(-1)[0];
    const macd = technicalindicators_1.MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
    }).slice(-1)[0];
    const atr = technicalindicators_1.ATR.calculate({
        period: 14,
        high: highs,
        low: lows,
        close: closes,
    }).slice(-1)[0];
    const ma50 = technicalindicators_1.SMA.calculate({ period: 50, values: closes }).slice(-1)[0];
    const ma200 = technicalindicators_1.SMA.calculate({ period: 200, values: closes }).slice(-1)[0];
    const currentPrice = closes[closes.length - 1];
    const recentCandles = candles.slice(-50);
    const recentHigh = Math.max(...recentCandles.map((c) => c.high));
    const recentLow = Math.min(...recentCandles.map((c) => c.low));
    const lastCandle = candles[candles.length - 1];
    const features = {
        symbol: "US30",
        timeframe: "M1",
        current_price: currentPrice,
        technical_indicators: {
            rsi14: rsi,
            stochasticK: stoch?.k,
            stochasticD: stoch?.d,
            macd: macd?.MACD,
            macdSignal: macd?.signal,
            atr14: atr,
        },
        trend_context: {
            ma50,
            ma200,
            ma50_trend: ma50 > ma200 ? "UP" : "DOWN",
            price_vs_ma50: currentPrice > ma50 ? "ABOVE" : "BELOW",
            price_vs_ma200: currentPrice > ma200 ? "ABOVE" : "BELOW",
        },
        structure: {
            recent_swing_high: recentHigh,
            recent_swing_low: recentLow,
            distance_to_swing_high: +(recentHigh - currentPrice).toFixed(2),
            distance_to_swing_low: +(recentLow - currentPrice).toFixed(2),
        },
        volatility: {
            current_range: +(lastCandle.high - lastCandle.low).toFixed(2),
            average_range: +((recentHigh - recentLow) / 50).toFixed(2),
        },
        candles: candles.slice(-100),
    };
    const prompt = `
  You are an expert trading AI specialized in scalping the US30 (Dow Jones Index CFD) on the M1 timeframe.
  
  You will be provided with comprehensive market data including:
  - Technical indicators (RSI, MACD, Stochastic, ATR)
  - Recent price action candles (showing patterns, momentum, reversals)
  - Support and resistance structures (recent swing highs/lows)
  - Volatility levels (current and average ranges)
  - Current market price
  
  Your task is to analyze this data and:
  
  1️⃣ Decide clearly whether to open a BUY or SELL position right now.
  2️⃣ Recommend precise stop loss and take profit price levels that align logically with your trade direction, volatility, and recent market structure.
  
  📌 **Response Format (only valid JSON):**
  {
    "side": "BUY",
    "stop_loss": 42975.2,
    "take_profit": 43082.7
  }
  
  ⚠️ **Important Rules & Guidelines:**
  - The Stop Loss (SL) must be between 10 and 100 points from the current price, placed logically relative to recent swings and volatility (ATR).
  - The Take Profit (TP) must be between 10 and 150 points from the current price, aiming to capture most of the realistic expected move.
  - TP distance must be at least 1.2× SL distance and no more than 2× SL distance to maintain good risk/reward management.
  - For BUY positions: SL must be BELOW current price, TP ABOVE current price.
  - For SELL positions: SL must be ABOVE current price, TP BELOW current price.
  - Utilize ATR (Average True Range) value provided to help determine appropriate distances for SL and TP.
  - Use recent swing high/low data to place SL beyond logical support/resistance areas when possible.
  - Aim to realistically maximize profit capture while maintaining conservative and realistic risk.
  
  Return ONLY the JSON object exactly as specified. No explanations, no markdown formatting, no extra text.
  
  Current Market Price: ${currentPrice}
  
  Market Data Provided:
  ${JSON.stringify(features, null, 2)}
  `;
    return prompt;
}
