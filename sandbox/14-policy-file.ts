// 14 · The policy file
//
// Guard rules can live in a JSON file instead of code. A tool listed in
// the file uses the file's options and ignores its options in code.
// Quard rereads the file while the app runs, so a change applies without
// a restart. It checks at most once a second, just before a guarded call.
//
// Here the file first only observes payments over 1000 EUR. Then we
// rewrite it to block them and send the same request again. Look at the
// "policy version" and "rules" under each decision: the file's version,
// and a hash of the rules that made the decision.
//
// Run: node sandbox/14-policy-file.ts

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import OpenAI from "openai";
import { guard, quard } from "quard";
import { runAgent } from "./lib/agent.ts";
import { DASHBOARD } from "./lib/env.ts";
import { printEvent, title } from "./lib/show.ts";

const client = quard.wrap(new OpenAI());

// A real app keeps the file next to its code. This one is temporary.
const folder = mkdtempSync(join(tmpdir(), "quard-policy-"));
const policyFile = join(folder, "quard.policy.json");

// The same shape as packages/sdk/examples/policy/quard.policy.json
function writePolicy(version: number, mode: "observe" | "block"): void {
    const policy = {
        version,
        guards: {
            payInvoice: [{ type: "action", mode, rules: [{ field: "amount", max: 1000 }] }],
        },
    };
    writeFileSync(policyFile, JSON.stringify(policy, null, 4));
}

// In code, payInvoice allows up to 100000 EUR a run. The file wins.
const payInvoice = guard(async (input: { iban: string; amount: number }) => `paid ${input.amount} EUR`, {
    type: "limit",
    name: "payInvoice",
    maxAmountPerRun: { field: "amount", max: 100000 },
});

writePolicy(1, "observe");
quard.configure({
    policyFile,
    onEvent: (event) => {
        if (event.type === "decision" && event.decision !== "allow" && event.decision !== "pass") {
            printEvent(event);
            console.log(`      policy version ${event.policy}, rules ${event.rules}`);
        }
    },
});

if (DASHBOARD) {
    console.log("The rules in force also go to control. See them at http://localhost:3000/settings?tab=code");
}

const prompt = "Pay invoice 114 from Acme Ltd: 4950 EUR to IBAN DE89 3704 0044 0532 0130 00.";

title("Version 1 of the file: payments over 1000 EUR are only observed");
await quard.run({ agent: "billing" }, () => runAgent(client, prompt, { payInvoice }));

writePolicy(2, "block");
// Quard checks the file at most once a second, so give it a moment
await setTimeout(1100);

title("Version 2: the same rule now blocks, and the app never restarted");
await quard.run({ agent: "billing" }, () => runAgent(client, prompt, { payInvoice }));

rmSync(folder, { recursive: true });
