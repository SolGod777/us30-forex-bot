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

const CHECK_TRADE_INTERVAL = 15 * 60 * 1000;

const lotSize = 1;
const numCandles = 10;
const symbol = "US30";
const timeframe = "1m";
const riskPoints = 50; // Adjust your risk
// const rewardPoints = riskPoints * 1.5;

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
  console.log("Checking market...");

  // Check if there’s already open position
  const positions = await connection.getPositions();
  const us30Positions = positions.filter((p) => p.symbol === symbol);
  if (us30Positions.length > 0) {
    console.log("Existing position found, skipping trade.");
    return;
  }

  const now = new Date();

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
      Here are the last 5 one-minute candles for US30 (in JSON format):
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

  console.log(`Trend: ${side.toUpperCase()}`);

  let stopLoss: number;
  // let takeProfit: number;

  if (side === "buy") {
    stopLoss = currentPrice - riskPoints;
    // takeProfit = currentPrice + rewardPoints;
    await connection.createMarketBuyOrder(
      symbol,
      lotSize,
      stopLoss,
      undefined,
      {
        trailingStopLoss: {
          threshold: {
            thresholds: [
              { threshold: 50, stopLoss: 20 },
              { threshold: 100, stopLoss: 10 },
              { threshold: 150, stopLoss: 5 },
            ],
            units: "RELATIVE_POINTS",
          },
        },
      }
    );
  } else {
    stopLoss = currentPrice + riskPoints;
    // takeProfit = currentPrice - rewardPoints;
    await connection.createMarketSellOrder(
      symbol,
      lotSize,
      stopLoss,
      undefined,
      {
        trailingStopLoss: {
          threshold: {
            thresholds: [
              { threshold: 50, stopLoss: 20 },
              { threshold: 100, stopLoss: 10 },
              { threshold: 150, stopLoss: 5 },
            ],
            units: "RELATIVE_POINTS",
          },
        },
      }
    );
  }

  console.log(`Trade executed: ${side.toUpperCase()} with SL: ${stopLoss}`);
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
  startBot().catch(console.error);
});
