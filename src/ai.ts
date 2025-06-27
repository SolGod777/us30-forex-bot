import axios from "axios";
import * as dotenv from "dotenv";
dotenv.config();

const OPEN_AI_KEY = process.env.OPEN_AI_KEY!;

export const askAi = async (
  prompt: string
): Promise<{
  side: "BUY" | "SELL";
}> => {
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

  let content = response.data.choices[0].message.content?.trim();
  console.log("GPT raw response:", content);

  // 🔧 Remove Markdown code block markers if present
  if (content?.startsWith("```json")) {
    content = content.replace(/```json|```/g, "").trim();
  }

  try {
    const parsed: { side: "BUY" | "SELL" } = JSON.parse(content!);
    if (parsed && (parsed.side === "BUY" || parsed.side === "SELL")) {
      const clamp = (value: number, min: number, max: number) =>
        Math.max(min, Math.min(value, max));

      return parsed;
    } else {
      throw new Error("Invalid AI trade decision format.");
    }
  } catch (e) {
    throw new Error(`Failed to parse AI response: ${content}`);
  }
};

import { RSI, SMA, Stochastic, MACD, ATR } from "technicalindicators";
import { OandaRawCandle } from "./types";

export function buildPrompt(candles: OandaRawCandle[]): string {
  if (candles.length < 200) throw new Error("Need at least 200 candles");

  const closes = candles.map((c) => parseFloat(c.mid.c));
  const highs = candles.map((c) => parseFloat(c.mid.h));
  const lows = candles.map((c) => parseFloat(c.mid.l));
  const opens = candles.map((c) => parseFloat(c.mid.o));

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
  const lastCandle = candles[candles.length - 1];
  const recent = candles.slice(-20);
  const recentHigh = Math.max(...recent.map((c) => parseFloat(c.mid.h)));
  const recentLow = Math.min(...recent.map((c) => parseFloat(c.mid.l)));

  const bullishCount = recent.filter(
    (c) => parseFloat(c.mid.c) > parseFloat(c.mid.o)
  ).length;
  const bearishCount = 20 - bullishCount;

  const priceMomentum =
    recentHigh - recentLow < (atr ?? 0) * 2 ? "RANGE" : "BREAKOUT";

  const utcHour = new Date().getUTCHours();
  let session = "Asia";
  if (utcHour >= 7 && utcHour < 15) session = "London";
  if (utcHour >= 13 && utcHour < 21) session = "New York";

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
      current_range: +(
        parseFloat(lastCandle.mid.h) - parseFloat(lastCandle.mid.l)
      ).toFixed(2),
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

- StopLoss Pips = 8
- TakeProfit Pips = 10

Your job:
1. Decide "BUY" or "SELL"

Reply only in valid JSON format like:
{
  "side": "BUY",
}

Current Price: ${currentPrice}
Market Data:
${JSON.stringify(features, null, 2)}
`;
}
