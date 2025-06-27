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
    let content = response.data.choices[0].message.content?.trim();
    console.log("GPT raw response:", content);
    // 🔧 Remove Markdown code block markers if present
    if (content?.startsWith("```json")) {
        content = content.replace(/```json|```/g, "").trim();
    }
    try {
        const parsed = JSON.parse(content);
        if (parsed &&
            (parsed.side === "BUY" || parsed.side === "SELL") &&
            typeof parsed.slPips === "number" &&
            typeof parsed.tpPips === "number") {
            return parsed;
        }
        else {
            throw new Error("Invalid AI trade decision format.");
        }
    }
    catch (e) {
        throw new Error(`Failed to parse AI response: ${content}`);
    }
};
exports.askAi = askAi;
const technicalindicators_1 = require("technicalindicators");
function buildPrompt(candles) {
    if (candles.length < 200)
        throw new Error("Need at least 200 candles");
    const closes = candles.map((c) => parseFloat(c.mid.c));
    const highs = candles.map((c) => parseFloat(c.mid.h));
    const lows = candles.map((c) => parseFloat(c.mid.l));
    const opens = candles.map((c) => parseFloat(c.mid.o));
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
    const lastCandle = candles[candles.length - 1];
    const recent = candles.slice(-20);
    const recentHigh = Math.max(...recent.map((c) => parseFloat(c.mid.h)));
    const recentLow = Math.min(...recent.map((c) => parseFloat(c.mid.l)));
    const bullishCount = recent.filter((c) => parseFloat(c.mid.c) > parseFloat(c.mid.o)).length;
    const bearishCount = 20 - bullishCount;
    const priceMomentum = recentHigh - recentLow < (atr ?? 0) * 2 ? "RANGE" : "BREAKOUT";
    const utcHour = new Date().getUTCHours();
    let session = "Asia";
    if (utcHour >= 7 && utcHour < 15)
        session = "London";
    if (utcHour >= 13 && utcHour < 21)
        session = "New York";
    const features = {
        symbol: "USD/JPY",
        timeframe: "M1",
        session,
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
        },
        momentum: {
            price_momentum: priceMomentum,
            recent_bullish_candles: bullishCount,
            recent_bearish_candles: bearishCount,
        },
        volatility: {
            current_range: +(parseFloat(lastCandle.mid.h) - parseFloat(lastCandle.mid.l)).toFixed(2),
            average_range: +((recentHigh - recentLow) / 20).toFixed(2),
        },
    };
    return `
You are an expert forex scalping AI trading USD/JPY on the 1-minute chart.

You are provided with:
- Technical indicators (RSI, MACD, Stochastic, ATR)
- Trend direction via moving averages
- Candle sentiment, structure, momentum, and volatility
- Active market session (Asia, London, or New York)

Your job:
1. Decide "BUY" or "SELL"
2. Recommend SL and TP values (in pips) based on structure and volatility

Reply only in valid JSON format like:
{
  "side": "BUY",
  "slPips": 12,
  "tpPips": 20
}

Current Price: ${currentPrice}
Market Data:
${JSON.stringify(features, null, 2)}
`;
}
