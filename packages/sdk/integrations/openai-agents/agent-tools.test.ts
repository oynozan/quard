import type { RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { quard } from "../../index.ts";
import { modelCalls, scriptedClient, testAgent } from "../../test/openai-agents.ts";
import { resetAll } from "../../test/reset.ts";
import { quardRunner } from "./runner.ts";
import { guardedTool } from "./tool.ts";

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
});

const NOTE = { name: "note", args: { text: "Invoice 114" } };
const RESEARCH = { name: "research", args: { input: "Read invoice 114." } };

// The orchestrator asks for a guarded tool and an agent tool in one turn
async function parallelRun(calls: Array<{ name: string; args: object }>) {
    const note = guardedTool({
        name: "note",
        description: "Write a note",
        parameters: z.object({ text: z.string() }),
        execute: async () => "noted",
        guard: { type: "limit", maxCallsPerRun: 5 },
    });
    const researcher = testAgent("researcher");
    const orchestrator = testAgent("orchestrator", {
        tools: [note, researcher.asTool({ toolName: "research", toolDescription: "Read a page" })],
    });
    const { client } = scriptedClient({
        orchestrator: [{ calls }, { text: "Done." }],
        researcher: [{ text: "Invoice 114 is due." }],
    });
    await quardRunner({ client }).run(orchestrator, "Note and read invoice 114.");
}

describe("an agent tool called beside another tool", () => {
    it.each([
        ["the guarded tool first", [NOTE, RESEARCH]],
        ["the agent tool first", [RESEARCH, NOTE]],
    ])("hangs below the model call that asked for it, with %s", async (_order, calls) => {
        await parallelRun(calls);

        const [asked, researching] = modelCalls(events);
        const handoff = events.find((event) => event.type === "handoff");
        expect(researching?.agent).toBe("researcher");
        expect(handoff).toMatchObject({ to: "researcher", via: "tool", stepId: asked?.stepId });
        expect(researching?.parentStepId).toBe(asked?.stepId);
    });
});
