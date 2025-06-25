import axios from "axios";
import * as dotenv from "dotenv";
dotenv.config();

const OPEN_AI_KEY = process.env.OPEN_AI_KEY;

export const askAi = async (prompt: string): Promise<string | undefined> => {
  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
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

  const reply = response.data.choices[0].message.content;
  console.log("GPT response:", reply);

  let side: undefined | "buy" | "sell";
  if (reply.toLowerCase().includes("buy")) {
    side = "buy";
  } else if (reply.toLowerCase().includes("sell")) {
    side = "sell";
  } else {
    console.log("GPT returned unclear result.");
  }
  return side;
};

import { RSI, SMA, Stochastic, MACD, ATR } from "technicalindicators";

type Candle = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: Date;
};

export function buildPrompt(
  candles: Candle[],
  slDistance: number,
  tpDistance: number
): string {
  if (candles.length < 200) {
    throw new Error("Need at least 200 candles");
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

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
  const recentHigh = Math.max(...recentCandles.map((c) => c.high));
  const recentLow = Math.min(...recentCandles.map((c) => c.low));
  const lastCandle = candles[candles.length - 1];

  const features = {
    symbol: "US30",
    timeframe: "M1",
    current_price: currentPrice,
    sl_distance: slDistance,
    tp_distance: tpDistance,
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
You are an expert trading AI for US30 (Dow Jones Index CFD) on the M1 timeframe.

You are provided with complete market data including:
- Technical indicators
- Price action candles
- Support/resistance structure
- Volatility levels
- Stop loss and take profit distances

Your task:

1️⃣ Analyze all data carefully.
2️⃣ Use price action patterns, trend alignment, momentum indicators, volatility, and SL/TP positioning.
3️⃣ Decide whether to open a BUY or SELL position right now.

Only reply with one word: BUY or SELL (in ALL CAPS, no explanation).

Market data:
${JSON.stringify(features, null, 2)}
`;

  return prompt;
}
