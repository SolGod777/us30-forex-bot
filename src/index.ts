import MetaApi, {
  MetatraderAccount,
  RpcMetaApiConnectionInstance,
} from "metaapi.cloud-sdk";
import { askAi } from "./ai";
import * as dotenv from "dotenv";
import { fallbackSideSelctor } from "./utils";
// import { manageTrailingStop } from "./manage";
import { flattenAllPositions, shouldFlattenNow } from "./close";

import express from "express";

dotenv.config();

const METAAPI_TOKEN = process.env.METAAPI_TOKEN!;
const ACCOUNT_ID = process.env.ACCOUNT_ID!;
const TRADE_INTERVAL = process.env.TRADE_INTERVAL!;

const CHECK_TRADE_INTERVAL = Number(TRADE_INTERVAL) * 60 * 1000;

const lotSize = Number(process.env.LOT_SIZE) || 1;
const symbol = "US30";
const timeframe = "1m";
const riskPoints = Number(process.env.RISK_POINTS) || 50; // Adjust your risk
const rewardMultiplier = Number(process.env.REWARD_MULTIPLIER) || 1.5;
const rewardPoints = riskPoints * rewardMultiplier;

async function connectToAccount() {
  const api = new MetaApi(METAAPI_TOKEN);
  const account = await api.metatraderAccountApi.getAccount(ACCOUNT_ID);
  const c = account.getRPCConnection();
  await c.connect();
  await c.waitSynchronized();

  await account.deploy();
  await account.waitConnected();
  // const streaming = account.getStreamingConnection();

  console.log("Connected to MetaApi & Broker.");
  return { connection: c, account };
}

async function checkAndTrade(
  connection: RpcMetaApiConnectionInstance,
  account: MetatraderAccount
) {
  const now = new Date();
  const hoursUtc = now.getUTCHours();

  // Only run between 11:00 - 20:00 UTC
  if (hoursUtc < 11 || hoursUtc >= 20) {
    console.log("Outside trading hours, skipping trade check.");
    return;
  }

  console.log("Checking market...");

  // Check if there’s already open position
  const positions = await connection.getPositions();
  const us30Positions = positions.filter((p) => p.symbol === symbol);
  const openCount = us30Positions.length;

  if (openCount >= 3) {
    console.log("Max open positions reached, skipping.");
    return;
  }
  const numCandles = openCount === 0 ? 30 : 15;

  const candles = await account.getHistoricalCandles(
    symbol,
    timeframe,
    now,
    numCandles
  );
  if (candles.length < numCandles) {
    console.log("Not enough candles.");
    return;
  }

  let side: undefined | string = "";
  try {
    const jsonData = JSON.stringify(candles);
    const prompt = `
      Here are the last ${numCandles} one-minute candles for US30 (in JSON format):
      ${jsonData}

      Assume this is an index CFD with high volatility. Use basic price action patterns to make your BUY or SELL decision.
      
      Based on this data, should I open a BUY or SELL? 
      Only reply with exactly 'BUY' or 'SELL'.
`;

    side = await askAi(prompt);
  } catch (e) {
    console.log("ChatGPT error: ", e);
  }
  const price = await connection.getSymbolPrice(symbol, false);
  const currentPrice = price.bid;

  // fallback without AI
  if (!side) {
    side = fallbackSideSelctor(candles, currentPrice);
  }

  // Determine risk points based on how many positions are already open
  let currentRiskPoints = riskPoints; // default full risk
  let lotToUse = lotSize;
  if (openCount >= 1) {
    currentRiskPoints = riskPoints / 2;
    lotToUse = 1;
  }

  console.log(`Trend: ${side.toUpperCase()}`);

  let stopLoss: number;
  let takeProfit: number;

  if (side === "buy") {
    stopLoss = currentPrice - currentRiskPoints;
    takeProfit = currentPrice + currentRiskPoints + rewardPoints;
    await connection.createMarketBuyOrder(
      symbol,
      lotToUse,
      stopLoss,
      takeProfit
    );
  } else {
    stopLoss = currentPrice + currentRiskPoints;
    takeProfit = currentPrice - currentRiskPoints * rewardMultiplier;
    await connection.createMarketSellOrder(
      symbol,
      lotToUse,
      stopLoss,
      takeProfit
    );
  }

  console.log(
    `Trade executed: ${side.toUpperCase()} with SL: ${stopLoss}, TP: ${takeProfit}`
  );
}

async function startBot() {
  const { connection, account } = await connectToAccount();

  // Run immediately once
  await checkAndTrade(connection, account);

  // Then run every 15 minutes
  setInterval(async () => {
    try {
      await checkAndTrade(connection, account);
    } catch (err) {
      console.error("Error during trading cycle:", err);
    }
  }, CHECK_TRADE_INTERVAL); // every 15 minutes
}

const app = express();
const PORT = process.env.PORT || 8080;

app.get("/", (req: any, res: any) => {
  res.send("US30 Bot running");
});

app.listen(PORT, () => {
  console.log(`HTTP server running on port ${PORT}`);
});

startBot().catch(console.error);
