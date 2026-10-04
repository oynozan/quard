// 18 · Run limits
//
// Every run has limits on delegation depth, fan-out, turns back and forth
// between two agents, model calls and cost. They are product defaults, so
// they start in observe mode: Quard records "would block" and the run goes
// on. quard.configure({ runLimits }) changes them, and mode "block" turns
// them on.
//
// A writer and a critic pass a tagline back and forth with a guarded
// sendMessage tool. Its delegateTo option names the argument that holds
// the receiving agent, so Quard counts the turns between the two. Here
// the limit is 3 turns, and the app asks for 4.
//
//   1  Observe mode: the 4th turn is recorded as over the limit, and runs.
//   2  Block mode: the 4th message is refused, and the model reads why.
//   3  Block mode with at most 3 model calls a run: the 4th model call is
//      refused before it is sent, the client throws, and the run ends
//      blocked.
//
// Run: node sandbox/25-run-limits.ts

import OpenAI from "openai";
import { guard, quard } from "quard";
import { runAgent } from "./lib/agent.ts";
import { title } from "./lib/show.ts";

const client = quard.wrap(new OpenAI());

// The last message sent, which the other agent reads next
let inbox = "";
const sendMessage = guard(
    async (input: { to: string; text: string }) => {
        inbox = input.text;
        return `delivered to ${input.to}`;
    },
    { type: "limit", name: "sendMessage", delegateTo: "to" },
);

function promptFor(agent: string): string {
    if (agent === "critic") {
        return `You are the critic. The writer sent this tagline: "${inbox}". Send one short suggestion to "writer" with sendMessage.`;
    }
    const task =
        inbox === ""
            ? "Write a tagline of at most six words for Acme's new coffee mug."
            : `The critic replied: "${inbox}". Write a better tagline of at most six words.`;
    return `You are the writer. ${task} Send it to "critic" with sendMessage.`;
}

// Turns alternate between the writer and the critic, in one run
async function conversation(turns: number): Promise<void> {
    inbox = "";
    await quard.run({ agent: "team" }, async () => {
        for (let turn = 1; turn <= turns; turn++) {
            const agent = turn % 2 === 1 ? "writer" : "critic";
            console.log(`  Turn ${turn}, the ${agent}`);
            await quard.agent(agent, () => runAgent(client, promptFor(agent), { sendMessage }));
        }
    });
}

quard.configure({
    onEvent: (event) => {
        if (event.type === "decision" && event.guard === "limit" && event.decision === "block") {
            const verdict = event.enforced ? "blocks" : "would block, but only observes";
            console.log(`    · run limit ${event.rule} ${verdict} (${event.agent})`);
        } else if (event.type === "run_finished") {
            console.log(`  The run ended: ${event.status}`);
        }
    },
});

title("1 · Observe mode, at most 3 turns between two agents");
quard.configure({ runLimits: { loops: 3 } });
await conversation(4);

title("2 · Block mode, at most 3 turns between two agents");
quard.configure({ runLimits: { mode: "block", loops: 3 } });
await conversation(4);

title("3 · Block mode, at most 3 model calls in the run");
quard.configure({ runLimits: { mode: "block", loops: 5, steps: 3 } });
try {
    await conversation(4);
} catch (error) {
    const why = error instanceof OpenAI.APIError ? `${error.status} ${error.code}` : String(error);
    console.log(`  The client threw: ${why}`);
}
