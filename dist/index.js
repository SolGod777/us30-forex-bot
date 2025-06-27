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
const express_1 = __importDefault(require("express"));
dotenv.config();
const API_KEY = process.env.OANDA_API_KEY;
const ACCOUNT_ID = process.env.ACCOUNT_ID;
const BASE_URL = "https://api-fxpractice.oanda.com/v3";
const INSTRUMENTS = ["USD_JPY", "GBP_USD"];
const SIZE = 50000;
const SL = 3;
const TP = 4;
const HEADERS = {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
};
async function fetchCandles(count, granularity = "M1", instrument) {
    const res = await axios_1.default.get(`${BASE_URL}/instruments/${instrument}/candles`, {
        headers: HEADERS,
        params: {
            count,
            granularity,
            price: "M",
        },
    });
    return res.data.candles;
}
async function decideAction(candles, instrument) {
    const prompt = (0, ai_1.buildPrompt)(candles, instrument);
    const side = await (0, ai_1.askAi)(prompt);
    return side;
}
async function fetchPricingAndBuildSLTP(instrument, side, stopPips = SL, takePips = TP) {
    const res = await axios_1.default.get(`${BASE_URL}/accounts/${ACCOUNT_ID}/pricing`, {
        headers: HEADERS,
        params: { instruments: instrument },
    });
    const priceData = res.data?.prices?.[0];
    if (!priceData)
        throw new Error("No pricing data found");
    const pip = 0.01;
    const bid = parseFloat(priceData.bids[0].price);
    const ask = parseFloat(priceData.asks[0].price);
    const entryPrice = side === "BUY" ? ask : bid;
    const stopLoss = side === "BUY"
        ? +(entryPrice - stopPips * pip).toFixed(3)
        : +(entryPrice + stopPips * pip).toFixed(3);
    const takeProfit = side === "BUY"
        ? +(entryPrice + takePips * pip).toFixed(3)
        : +(entryPrice - takePips * pip).toFixed(3);
    return {
        instrument,
        side,
        entryPrice: +entryPrice.toFixed(3),
        stopLoss,
        takeProfit,
        bid: +bid.toFixed(3),
        ask: +ask.toFixed(3),
    };
}
function buildOrderPayload(instrument, side, entryPrice, slPips, tpPips) {
    const units = side === "BUY" ? SIZE : -SIZE;
    const pipValue = instrument.endsWith("JPY") ? 0.01 : 0.0001;
    const slPrice = side === "BUY"
        ? (entryPrice - slPips * pipValue).toFixed(3)
        : (entryPrice + slPips * pipValue).toFixed(3);
    const tpPrice = side === "BUY"
        ? (entryPrice + tpPips * pipValue).toFixed(3)
        : (entryPrice - tpPips * pipValue).toFixed(3);
    return {
        order: {
            type: "MARKET",
            instrument,
            units: units.toString(),
            timeInForce: "FOK",
            positionFill: "DEFAULT",
            stopLossOnFill: { price: slPrice },
            takeProfitOnFill: { price: tpPrice },
        },
    };
}
async function placeMarketOrder(instrument, side, entryPrice, sl, tp) {
    const body = buildOrderPayload(instrument, side, entryPrice, sl, tp);
    const res = await axios_1.default.post(`${BASE_URL}/accounts/${ACCOUNT_ID}/orders`, body, { headers: HEADERS });
    return res.data;
}
async function fetchOpenTrades() {
    const res = await axios_1.default.get(`${BASE_URL}/accounts/${ACCOUNT_ID}/openTrades`, {
        headers: HEADERS,
    });
    return res.data.trades;
}
async function checkAndTrade() {
    try {
        const openTrades = await fetchOpenTrades();
        for (const instrument of INSTRUMENTS) {
            const hasPosition = openTrades.some((trade) => trade.instrument === instrument);
            if (hasPosition) {
                console.log(`${instrument}: Position active, skipping...`);
                continue;
            }
            const candles = await fetchCandles(200, "M1", instrument);
            const action = await decideAction(candles, instrument);
            console.log(`[${instrument}] Decision: ${action}`);
            const config = await fetchPricingAndBuildSLTP(instrument, action);
            await placeMarketOrder(instrument, action, config.entryPrice, SL, TP);
            console.log(`[${instrument}] Executed ${action} order. SL: ${config.stopLoss}, TP: ${config.takeProfit}`);
        }
    }
    catch (err) {
        console.error("Bot error:", err);
    }
}
function startBot() {
    checkAndTrade();
    setInterval(checkAndTrade, Number(process.env.TRADE_INTERVAL) * 60 * 1000);
}
const app = (0, express_1.default)();
const port = process.env.PORT || 8080;
app.use(express_1.default.json());
app.get("/", (req, res) => {
    res.send("Hello from Express + TypeScript");
});
app.listen(port, () => {
    console.log(`Server running on ${port}`);
});
startBot();
