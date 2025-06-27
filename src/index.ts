import axios from "axios";
import * as dotenv from "dotenv";
import { askAi, buildPrompt } from "./ai";
import { OandaCandleResponse, OandaRawCandle } from "./types";

dotenv.config();

const API_KEY = process.env.OANDA_API_KEY!;
const ACCOUNT_ID = process.env.ACCOUNT_ID!;
const BASE_URL = "https://api-fxpractice.oanda.com/v3";
const UNITS = Number(process.env.LOT_SIZE!);
const Instrument = "USD_JPY";
const SIZE = 100_000;
const SL = 8;
const TP = 12;

const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

export async function fetchCandles(
  count: number,
  granularity: string = "M1"
): Promise<OandaRawCandle[]> {
  const res = await axios.get<OandaCandleResponse>(
    `${BASE_URL}/instruments/${Instrument}/candles`,
    {
      headers: HEADERS,
      params: {
        count,
        granularity,
        price: "M",
      },
    }
  );

  return res.data.candles;
}

// === Dummy AI: Decide BUY/SELL ===
async function decideAction(candles: OandaRawCandle[]): Promise<{
  side: "BUY" | "SELL";
  slPips: number;
  tpPips: number;
}> {
  const prompt = buildPrompt(candles);
  const action = await askAi(prompt);
  return action;
}
export async function fetchPricingAndBuildSLTP(
  instrument: string,
  side: "BUY" | "SELL",
  stopPips: number = 3,
  takePips: number = 5
) {
  const res = await axios.get(`${BASE_URL}/accounts/${ACCOUNT_ID}/pricing`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
    params: {
      instruments: instrument,
    },
  });

  const priceData = res.data?.prices?.[0];
  if (!priceData) throw new Error("No pricing data found");

  const pip = 0.01; // pip size for JPY pairs
  const bid = parseFloat(priceData.bids[0].price);
  const ask = parseFloat(priceData.asks[0].price);
  const entryPrice = side === "BUY" ? ask : bid;

  // clamp pips just in case
  const slPips = Math.min(Math.max(stopPips, 10), 200); // between 10–200
  const tpPips = Math.min(Math.max(takePips, 10), 300); // between 10–300

  const stopLoss =
    side === "BUY"
      ? +(entryPrice - slPips * pip).toFixed(3)
      : +(entryPrice + slPips * pip).toFixed(3);

  const takeProfit =
    side === "BUY"
      ? +(entryPrice + tpPips * pip).toFixed(3)
      : +(entryPrice - tpPips * pip).toFixed(3);

  return {
    instrument,
    side,
    entryPrice: +entryPrice.toFixed(3),
    stopLoss,
    takeProfit,
    bid: +bid.toFixed(3),
    ask: +ask.toFixed(3),
    stopPips: slPips,
    takePips: tpPips,
  };
}

function buildOrderPayload(
  side: "BUY" | "SELL",
  entryPrice: number,
  slPips: number,
  tpPips: number
) {
  const units = side === "BUY" ? SIZE : -SIZE;
  const pipValue = 0.01; // for JPY pairs

  const slPrice =
    side === "BUY"
      ? (entryPrice - slPips * pipValue).toFixed(3)
      : (entryPrice + slPips * pipValue).toFixed(3);

  const tpPrice =
    side === "BUY"
      ? (entryPrice + tpPips * pipValue).toFixed(3)
      : (entryPrice - tpPips * pipValue).toFixed(3);

  return {
    order: {
      type: "MARKET",
      instrument: "USD_JPY",
      units: units.toString(),
      timeInForce: "FOK",
      positionFill: "DEFAULT",
      stopLossOnFill: { price: slPrice },
      takeProfitOnFill: { price: tpPrice },
    },
  };
}

// === Place market order ===
async function placeMarketOrder(
  side: "BUY" | "SELL",
  entryPrice: number,
  sl: number,
  tp: number
) {
  const body = buildOrderPayload(side, entryPrice, sl, tp);
  const res = await axios.post(
    `${BASE_URL}/accounts/${ACCOUNT_ID}/orders`,
    body,
    { headers: HEADERS }
  );
  return res.data;
}

// === Main bot logic ===
async function checkAndTrade() {
  try {
    const pos = await fetchOpenTrades();
    if (pos.length > 0) {
      console.log("Positions active, skipping...");
      return;
    }
    const candles = await fetchCandles(200);
    const action = await decideAction(candles);

    const config = await fetchPricingAndBuildSLTP(Instrument, action.side);
    await placeMarketOrder(
      action.side,
      Number(config.entryPrice),
      Number(action.slPips),
      Number(action.tpPips)
    );

    console.log(
      `Executed ${action.side} order. SL: ${action.slPips}, TP: ${action.tpPips}`
    );
  } catch (err) {
    console.error("Bot error:", err);
  }
}
export async function fetchOpenTrades() {
  const res = await axios.get(`${BASE_URL}/accounts/${ACCOUNT_ID}/openTrades`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  // Return the array of trades
  return res.data.trades as {
    id: string;
    instrument: string;
    price: string;
    openTime: string;
    currentUnits: string;
    unrealizedPL: string;
    state: string;
  }[];
}

// function startBot() {
//   checkAndTrade();
//   setInterval(checkAndTrade, Number(process.env.TRADE_INTERVAL!) * 60 * 1000);
// }
import express from "express";
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Example route
app.get("/", (req, res) => {
  res.send("Hello from Express + TypeScript");
});

// Start server
app.listen(port, () => {
  console.log(`Server running on 8080`);
});

app.post("/run-bot", async (req, res) => {
  await checkAndTrade();
  res.send("Bot ran.");
});
