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
exports.fetchCandles = fetchCandles;
exports.fetchPricingAndBuildSLTP = fetchPricingAndBuildSLTP;
exports.fetchOpenTrades = fetchOpenTrades;
const axios_1 = __importDefault(require("axios"));
const dotenv = __importStar(require("dotenv"));
const ai_1 = require("./ai");
dotenv.config();
const API_KEY = process.env.OANDA_API_KEY;
const ACCOUNT_ID = process.env.ACCOUNT_ID;
const BASE_URL = "https://api-fxpractice.oanda.com/v3";
const UNITS = Number(process.env.LOT_SIZE);
const Instrument = "USD_JPY";
const SIZE = 100000;
const SL = 4;
const TP = 5;
const HEADERS = {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
};
async function fetchCandles(count, granularity = "M1") {
    const res = await axios_1.default.get(`${BASE_URL}/instruments/${Instrument}/candles`, {
        headers: HEADERS,
        params: {
            count,
            granularity,
            price: "M",
        },
    });
    return res.data.candles;
}
// === Dummy AI: Decide BUY/SELL ===
async function decideAction(candles) {
    const prompt = (0, ai_1.buildPrompt)(candles);
    const action = await (0, ai_1.askAi)(prompt);
    return action;
}
async function fetchPricingAndBuildSLTP(instrument, side, stopPips = 3, takePips = 5) {
    const res = await axios_1.default.get(`${BASE_URL}/accounts/${ACCOUNT_ID}/pricing`, {
        headers: {
            Authorization: `Bearer ${API_KEY}`,
        },
        params: {
            instruments: instrument,
        },
    });
    const priceData = res.data?.prices?.[0];
    if (!priceData)
        throw new Error("No pricing data found");
    const pip = 0.01; // pip size for JPY pairs
    const bid = parseFloat(priceData.bids[0].price);
    const ask = parseFloat(priceData.asks[0].price);
    const entryPrice = side === "BUY" ? ask : bid;
    // clamp pips just in case
    const slPips = Math.min(Math.max(stopPips, 10), 200); // between 10–200
    const tpPips = Math.min(Math.max(takePips, 10), 300); // between 10–300
    const stopLoss = side === "BUY"
        ? +(entryPrice - slPips * pip).toFixed(3)
        : +(entryPrice + slPips * pip).toFixed(3);
    const takeProfit = side === "BUY"
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
function buildOrderPayload(side, entryPrice, slPips, tpPips) {
    const units = side === "BUY" ? SIZE : -SIZE;
    const pipValue = 0.01; // for JPY pairs
    const slPrice = side === "BUY"
        ? (entryPrice - slPips * pipValue).toFixed(3)
        : (entryPrice + slPips * pipValue).toFixed(3);
    const tpPrice = side === "BUY"
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
async function placeMarketOrder(side, entryPrice, sl, tp) {
    const body = buildOrderPayload(side, entryPrice, sl, tp);
    const res = await axios_1.default.post(`${BASE_URL}/accounts/${ACCOUNT_ID}/orders`, body, { headers: HEADERS });
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
        console.log(`[${new Date().toISOString()}] Decision: ${action}`);
        const config = await fetchPricingAndBuildSLTP(Instrument, action.side);
        await placeMarketOrder(action.side, Number(config.entryPrice), Number(action.slPips), Number(action.tpPips));
        console.log(`Executed ${action.side} order. SL: ${action.slPips}, TP: ${action.tpPips}`);
    }
    catch (err) {
        console.error("Bot error:", err);
    }
}
async function fetchOpenTrades() {
    const res = await axios_1.default.get(`${BASE_URL}/accounts/${ACCOUNT_ID}/openTrades`, {
        headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
        },
    });
    // Return the array of trades
    return res.data.trades;
}
// function startBot() {
//   checkAndTrade();
//   setInterval(checkAndTrade, Number(process.env.TRADE_INTERVAL!) * 60 * 1000);
// }
const express_1 = __importDefault(require("express"));
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
app.use(express_1.default.json());
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
