import axios from "axios";
import * as dotenv from "dotenv";
dotenv.config();

const OPEN_AI_KEY = process.env.OPEN_AI_KEY!;

export const askAi = async (
  prompt: string
): Promise<{
  side: "BUY" | "SELL";
  slPips: number;
  tpPips: number;
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
    const parsed: { side: "BUY" | "SELL"; slPips: number; tpPips: number } =
      JSON.parse(content!);
    if (parsed && (parsed.side === "BUY" || parsed.side === "SELL")) {
      const clamp = (value: number, min: number, max: number) =>
        Math.max(min, Math.min(value, max));

      // const sl = parsed.slPips;
      // const tp = parsed.tpPips;

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

  // Candle body/wick analysis
  const bodies = recent.map((c) =>
    Math.abs(parseFloat(c.mid.c) - parseFloat(c.mid.o))
  );
  const avgBodySize = +(
    bodies.reduce((a, b) => a + b, 0) / bodies.length
  ).toFixed(2);

  const avgWickSize = +(
    recent
      .map(
        (c) =>
          parseFloat(c.mid.h) -
          parseFloat(c.mid.l) -
          Math.abs(parseFloat(c.mid.c) - parseFloat(c.mid.o))
      )
      .reduce((a, b) => a + b, 0) / bodies.length
  ).toFixed(2);

  // Gap detection
  const gaps = recent
    .slice(1)
    .map((c, i) => parseFloat(c.mid.o) - parseFloat(recent[i].mid.c));
  const avgGap = +(
    gaps.reduce((a, b) => a + Math.abs(b), 0) / gaps.length
  ).toFixed(4);

  const features = {
    symbol: "USD/JPY",
    timeframe: "H1",
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
    body_structure: {
      avg_candle_body_size: avgBodySize,
      avg_total_wick_size: avgWickSize,
    },
    gap_behavior: {
      avg_hourly_gap: avgGap,
    },
    sentiment: {
      body_to_range_ratio: +(avgBodySize / (atr || 1)).toFixed(2),
    },
    volatility: {
      current_range: +(
        parseFloat(lastCandle.mid.h) - parseFloat(lastCandle.mid.l)
      ).toFixed(2),
      average_range: +((recentHigh - recentLow) / 20).toFixed(2),
    },
  };

  return `
You are an expert AI swing trader analyzing USD/JPY on the **hourly chart (H1)**.

You are given detailed market data, including:
- Technical indicators: RSI, MACD, Stochastic, ATR
- Trend information via moving averages
- Candle body/wick structure
- Recent sentiment and volatility
- Gap behavior and price momentum
- Current forex session (Asia, London, New York)

Your objective is:
1. Analyze all available data
2. Decide the best trading direction for the next few hours
3. Decide a reasonable slPips and tpPips from the current price and data.

Return only valid JSON like this:
{
  "side": "BUY",
  "slPips": 25,
  "tpPips": 45
}

Current Market Price: ${currentPrice}
Market Data:
${JSON.stringify(features, null, 2)}
`;
}
