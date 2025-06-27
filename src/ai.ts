import axios from "axios";
import * as dotenv from "dotenv";
dotenv.config();

const OPEN_AI_KEY = process.env.OPEN_AI_KEY!;

export const askAi = async (prompt: string): Promise<"BUY" | "SELL"> => {
  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    },
    {
      headers: {
        Authorization: `Bearer ${OPEN_AI_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  let reply = response.data.choices[0].message.content?.trim().toUpperCase();

  console.log("GPT raw response:", reply);

  if (reply === "BUY" || reply === "SELL") {
    return reply;
  } else {
    throw new Error(`Invalid GPT reply: ${reply}`);
  }
};

import { RSI, SMA, Stochastic, MACD, ATR } from "technicalindicators";
import { OandaRawCandle } from "./types";

export function buildPrompt(candles: OandaRawCandle[]): string {
  if (candles.length < 200) {
    throw new Error("Need at least 200 candles");
  }

  const closes = candles.map((c) => parseFloat(c.mid.c));
  const highs = candles.map((c) => parseFloat(c.mid.h));
  const lows = candles.map((c) => parseFloat(c.mid.l));

  const rsi = RSI.calculate({ period: 14, values: closes }).slice(-1)[0];
  const stoch = Stochastic.calculate({
    period: 14,
    signalPeriod: 3,
    high: highs,
    low: lows,
    close: closes,
  }).slice(-1)[0];
  const macd = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  }).slice(-1)[0];
  const atr = ATR.calculate({
    period: 14,
    high: highs,
    low: lows,
    close: closes,
  }).slice(-1)[0];
  const ma50 = SMA.calculate({ period: 50, values: closes }).slice(-1)[0];
  const ma200 = SMA.calculate({ period: 200, values: closes }).slice(-1)[0];

  const currentPrice = closes[closes.length - 1];
  const recentCandles = candles.slice(-50);
  const recentHigh = Math.max(...recentCandles.map((c) => parseFloat(c.mid.h)));
  const recentLow = Math.min(...recentCandles.map((c) => parseFloat(c.mid.l)));
  const lastCandle = candles[candles.length - 1];

  const features = {
    symbol: "USD/JPY",
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
    },
    volatility: {
      current_range: +(
        parseFloat(lastCandle.mid.h) - parseFloat(lastCandle.mid.l)
      ).toFixed(2),
      average_range: +((recentHigh - recentLow) / 50).toFixed(2),
    },
  };

  const prompt = `
You are an expert forex scalping AI trading USD/JPY on the 1-minute chart.

You are provided with:
- Technical indicators (RSI, MACD, Stochastic, ATR)
- Trend direction using moving averages
- Recent candle and price structure
- Volatility measures

Your only task is to analyze this data and reply with exactly one word: **"BUY"** or **"SELL"** — nothing else.

Current Market Price: ${currentPrice}

Market Data:
${JSON.stringify(features, null, 2)}

Reply with exactly one word: "BUY" or "SELL"
`;

  return prompt;
}
