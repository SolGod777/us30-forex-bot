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
const CHECK_TRADE_INTERVAL = 15 * 60 * 1000;
const lotSize = 1;
const numCandles = 10;
const symbol = "US30";
const timeframe = "1m";
const riskPoints = 50; // Adjust your risk
// const rewardPoints = riskPoints * 1.5;
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
    console.log("Checking market...");
    // Check if there’s already open position
    const positions = await connection.getPositions();
    const us30Positions = positions.filter((p) => p.symbol === symbol);
    if (us30Positions.length > 0) {
        console.log("Existing position found, skipping trade.");
        return;
    }
    const now = new Date();
    const candles = await account.getHistoricalCandles(symbol, timeframe, now, numCandles);
    if (candles.length < numCandles) {
        console.log("Not enough candles.");
        return;
    }
    let side = "";
    try {
        const jsonData = JSON.stringify(candles);
        const prompt = `
      Here are the last 5 one-minute candles for US30 (in JSON format):
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
    console.log(`Trend: ${side.toUpperCase()}`);
    let stopLoss;
    // let takeProfit: number;
    if (side === "buy") {
        stopLoss = currentPrice - riskPoints;
        // takeProfit = currentPrice + rewardPoints;
        await connection.createMarketBuyOrder(symbol, lotSize, stopLoss, undefined, {
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
        });
    }
    else {
        stopLoss = currentPrice + riskPoints;
        // takeProfit = currentPrice - rewardPoints;
        await connection.createMarketSellOrder(symbol, lotSize, stopLoss, undefined, {
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
        });
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
    startBot().catch(console.error);
});
