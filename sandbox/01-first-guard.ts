// 01 · Your first guard
//
// guard() wraps a tool function, and Quard checks every call. A blocked
// call returns a refusal instead of its result. The agent loop sends the
// refusal back to the model, which tells the user what happened.
//
// Here a limit guard lets sendSms run at most twice per run.
//
// Run: node sandbox/01-first-guard.ts

import OpenAI from "openai";
import { GuardBlockedError, guard, quard } from "quard";
import { runAgent } from "./lib/agent.ts";
import { title } from "./lib/show.ts";

// A copy of the OpenAI client, with Quard watching every call
const client = quard.wrap(new OpenAI());

async function sendSms(input: { to: string; text: string }) {
    return `sent "${input.text}" to ${input.to}`;
}

const PROMPT = "Text +1 555 0100 three separate messages: 'Hi', 'Your order shipped' and 'Thanks!'";

title("A limit of two texts per run");
// `name` is the tool name the model sees
const limitedSms = guard(sendSms, { type: "limit", name: "sendSms", maxCallsPerRun: 2 });
// quard.run() groups the calls into one run, and limits count per run
await quard.run({ agent: "assistant" }, () => runAgent(client, PROMPT, { sendSms: limitedSms }));

// Rather stop the whole run? With onBlock: "throw", the error leaves the
// agent loop, and your app decides what to do.
title('The same limit with onBlock: "throw"');
const strictSms = guard(sendSms, { type: "limit", name: "sendSms", maxCallsPerRun: 2, onBlock: "throw" });
try {
    await quard.run({ agent: "assistant" }, () => runAgent(client, PROMPT, { sendSms: strictSms }));
} catch (error) {
    if (!(error instanceof GuardBlockedError)) {
        throw error;
    }
    console.log(`  The run stopped: GuardBlockedError (${error.reason})`);
}
