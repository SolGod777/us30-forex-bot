"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.askAi = void 0;
const axios_1 = require("axios");
const dotenv = require("dotenv");
dotenv.config();
const OPEN_AI_KEY = process.env.OPEN_AI_KEY;
const askAi = async (prompt) => {
    const response = await axios_1.default.post("https://api.openai.com/v1/chat/completions", {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
    }, {
        headers: {
            Authorization: `Bearer ${OPEN_AI_KEY}`,
            "Content-Type": "application/json",
        },
    });
    const reply = response.data.choices[0].message.content;
    console.log("GPT response:", reply);
    let side;
    if (reply.toLowerCase().includes("buy")) {
        side = "buy";
    }
    else if (reply.toLowerCase().includes("sell")) {
        side = "sell";
    }
    else {
        console.log("GPT returned unclear result.");
    }
    return side;
};
exports.askAi = askAi;
