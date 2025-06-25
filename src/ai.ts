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
