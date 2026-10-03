import { labelFor } from "@quard/shared";
import { newRun } from "../context/run.ts";
import type { GuardCall } from "../guards/call.ts";
import { labelArguments } from "../labels/value-labels.ts";

// Builds a GuardCall from content the run read, for guard tests
export function makeCall(
    input: unknown,
    content: Array<[origin: string, text: string, flags?: string[]]> = [],
    tool = "testTool",
): GuardCall {
    const run = newRun();
    for (const [origin, text, flags] of content) {
        run.index.add(text, labelFor(origin, {}, flags), "s0");
    }
    return {
        tool,
        input,
        agent: "default",
        runId: run.runId,
        stepId: "s1",
        context: run.index.context(),
        values: labelArguments(input, run.index),
        run,
    };
}

// Events without the run_started record every new run begins with
export function withoutRunStarts<T extends { type: string }>(events: T[]): T[] {
    return events.filter((event) => event.type !== "run_started");
}
