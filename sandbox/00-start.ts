import OpenAI from "openai";
import { quard } from "quard";

process.loadEnvFile(new URL(".env", import.meta.url));

quard.configure({
    key: process.env.QUARD_AGENT_KEY,
    webhookUrl: "http://localhost:4100",
});

// A copy of the OpenAI client that Quard watches
const client = quard.wrap(new OpenAI());

await quard.run({ agent: "greeter" }, async () => {
    const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
    const response = await client.responses.create({ model, input: "Say hello in five words." });
    console.log(response.output_text);
});
