import axios from "axios";
import * as dotenv from "dotenv";
dotenv.config();

const OPEN_AI_KEY = process.env.OPEN_AI_KEY;

export const askAi = async (
  prompt: string
): Promise<
  { side: "buy" | "sell"; stopLoss: number; takeProfit: number } | undefined
> => {
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
    const side = parsed.side?.toLowerCase() as "buy" | "sell";
    const stopLoss =
      typeof parsed.stop_loss === "number" ? parsed.stop_loss : undefined;
    const takeProfit =
      typeof parsed.take_profit === "number" ? parsed.take_profit : undefined;

    return { side, stopLoss, takeProfit };
  } catch (e) {
    console.error("Failed to parse GPT response as JSON", e);
    throw new Error(`GPT error: ${e}`);
  }
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
  candles: Candle[]
  // slDistance: number,
  // tpDistance: number
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
  - Current market price
  
  Your task:
  
  1️⃣ Analyze the data
  2️⃣ Decide whether to open a BUY or SELL position
  3️⃣ Recommend a stop loss and take profit price
  
📌 Format your response as **valid JSON** with the following structure:

{
  "side": "BUY",
  "stop_loss": 42975.2,
  "take_profit": 43082.7
}

⚠️ Rules:
- SL must be 10 to 100 points from current price
- TP must be 10 to 150 points from current price
- TP distance (in points) must be at least 1.2x SL distance and no more than 2x SL distance
- For BUY: SL must be below current price, TP above
- For SELL: SL must be above current price, TP below
- Try to choose a TP that captures the majority of the expected move based on current volatility and recent structure
- Return only the JSON. Do not include explanations, markdown, or extra text.
  
  Current market price: ${currentPrice}
  
  Market data:
  ${JSON.stringify(features, null, 2)}
  `;

  return prompt;
}
