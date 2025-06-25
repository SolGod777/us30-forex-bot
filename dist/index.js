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
const metaapi_cloud_sdk_1 = __importDefault(require("metaapi.cloud-sdk"));
const ai_1 = require("./ai");
const dotenv = __importStar(require("dotenv"));
const utils_1 = require("./utils");
const express_1 = __importDefault(require("express"));
dotenv.config();
const METAAPI_TOKEN = process.env.METAAPI_TOKEN;
const ACCOUNT_ID = process.env.ACCOUNT_ID;
const TRADE_INTERVAL = process.env.TRADE_INTERVAL;
const CHECK_TRADE_INTERVAL = Number(TRADE_INTERVAL) * 60 * 1000;
const lotSize = Number(process.env.LOT_SIZE) || 1;
const symbol = "US30";
const timeframe = "1m";
const riskPoints = Number(process.env.RISK_POINTS) || 50; // Adjust your risk
const rewardMultiplier = Number(process.env.REWARD_MULTIPLIER) || 1.5;
const rewardPoints = riskPoints * rewardMultiplier;
async function connectToAccount() {
    const api = new metaapi_cloud_sdk_1.default(METAAPI_TOKEN);
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
async function checkAndTrade(connection, account) {
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
    console.log(us30Positions.length);
    if (openCount >= 3) {
        console.log("Max open positions reached, skipping.");
        return;
    }
    const numCandles = openCount === 0 ? 30 : 15;
    const candles = await account.getHistoricalCandles(symbol, timeframe, now, numCandles);
    if (candles.length < numCandles) {
        console.log("Not enough candles.");
        return;
    }
    let side = "";
    try {
        const jsonData = JSON.stringify(candles);
        const prompt = `
      Here are the last ${numCandles} one-minute candles for US30 (in JSON format):
      ${jsonData}

      Assume this is an index CFD with high volatility. Use basic price action patterns to make your BUY or SELL decision.
      
      Based on this data, should I open a BUY or SELL? 
      Only reply with exactly 'BUY' or 'SELL'.
`;
        side = await (0, ai_1.askAi)(prompt);
    }
    catch (e) {
        console.log("ChatGPT error: ", e);
    }
    const price = await connection.getSymbolPrice(symbol, false);
    const currentPrice = price.bid;
    // fallback without AI
    if (!side) {
        side = (0, utils_1.fallbackSideSelctor)(candles, currentPrice);
    }
    // Determine risk points based on how many positions are already open
    let currentRiskPoints = riskPoints; // default full risk
    let lotToUse = lotSize;
    if (openCount >= 1) {
        currentRiskPoints = riskPoints / 2;
        lotToUse = 1;
    }
    console.log(`Trend: ${side.toUpperCase()}`);
    let stopLoss;
    let takeProfit;
    if (side === "buy") {
        stopLoss = currentPrice - currentRiskPoints;
        takeProfit = currentPrice + currentRiskPoints * rewardMultiplier;
        await connection.createMarketBuyOrder(symbol, lotToUse, stopLoss, takeProfit);
    }
    else {
        stopLoss = currentPrice + currentRiskPoints;
        takeProfit = currentPrice - currentRiskPoints * rewardMultiplier;
        await connection.createMarketSellOrder(symbol, lotToUse, stopLoss, takeProfit);
    }
    console.log(`Trade executed: ${side.toUpperCase()} with SL: ${stopLoss}, TP: ${takeProfit}`);
}
async function startBot() {
    const { connection, account } = await connectToAccount();
    // Run immediately once
    await checkAndTrade(connection, account);
    // Then run every 15 minutes
    setInterval(async () => {
        try {
            await checkAndTrade(connection, account);
        }
        catch (err) {
            console.error("Error during trading cycle:", err);
        }
    }, CHECK_TRADE_INTERVAL); // every 15 minutes
}
const app = (0, express_1.default)();
const PORT = process.env.PORT || 8080;
app.get("/", (req, res) => {
    res.send("US30 Bot running");
});
app.listen(PORT, () => {
    console.log(`HTTP server running on port ${PORT}`);
});
startBot().catch(console.error);
