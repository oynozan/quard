import { join } from "node:path";
import { newRunId } from "@quard/shared";
import OpenAI from "openai";
import { jevDetector, quard, type Detector, type RunEvent } from "quard";
import { runAgent } from "../lib/agent.ts";
import { openaiDetector } from "../lib/detector.ts";
import { RECORDED } from "../lib/env.ts";
import { printEvent } from "../lib/show.ts";
import { askPrompt } from "./ask.ts";
import { buildResult, summaryLines, type SandboxResult } from "./result.ts";
import { readScenario, type Scenario } from "./scenario.ts";
import { guardedTools, type Check } from "./tools.ts";

// Jev when a TypeSafe key is set, else an OpenAI model
export function detectorFor(model: string): Detector {
    const key = process.env.TYPESAFE_API_KEY || process.env.TYPESAFE_API;
    return key ? jevDetector({ apiKey: key }) : openaiDetector(model);
}

// One guarded run. Throws before the run when the policy or feed is invalid.
export async function runScenario(scenario: Scenario, policyFile: string): Promise<SandboxResult> {
    const events: RunEvent[] = [];
    const checks: Check[] = [];
    // Thresholds come from the policy file's "detector" key
    quard.configure({
        policyFile,
        onEvent: (event) => {
            events.push(event);
            printEvent(event);
        },
        detector: scenario.detector ? detectorFor(scenario.model) : undefined,
    });
    const runId = newRunId();
    const client = quard.wrap(new OpenAI());
    const tools = guardedTools(scenario, checks);
    const options = { model: scenario.model, instructions: scenario.instructions };
    const started = performance.now();
    let answer: string | null = null;
    try {
        answer = await quard.run({ agent: "sandbox", runId }, () => runAgent(client, scenario.prompt, tools, options));
    } catch {
        // The run_finished event holds the status and the error
    }
    const totalMs = performance.now() - started;
    return buildResult({ runId, answer, recorded: RECORDED, totalMs, events, checks });
}

// Asks for the prompt, runs the scenario in dir once, then prints a summary and "@result" last.
// Returns the exit code: 130 when the person closed the terminal instead of answering.
export async function runPlayground(dir: string, ask = askPrompt): Promise<number> {
    let result: SandboxResult;
    try {
        const scenario = readScenario(join(dir, "scenario.json"));
        const prompt = await ask(scenario);
        if (prompt === undefined) {
            return 130;
        }
        // The policy finds signatures.json next to itself
        result = await runScenario({ ...scenario, prompt }, join(dir, "policy.json"));
    } catch (error) {
        console.error((error as Error).message);
        return 1;
    }
    console.log(["", ...summaryLines(result)].join("\n"));
    console.log(`@result ${JSON.stringify(result)}`);
    return 0;
}
