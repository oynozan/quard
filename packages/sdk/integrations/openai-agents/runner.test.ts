import type { RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { quard } from "../../index.ts";
import { modelCalls, scriptedClient, testAgent } from "../../test/openai-agents.ts";
import { resetAll } from "../../test/reset.ts";
import * as integration from "./index.ts";
import { quardRunner } from "./runner.ts";

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
});

describe("quard/openai-agents", () => {
    it("exports its public API", () => {
        expect(Object.keys(integration).sort()).toEqual(["guardedTool", "quardRunner"]);
    });
});

describe("quardRunner", () => {
    it("keeps the run config it is given", () => {
        const runner = quardRunner({
            client: scriptedClient({}).client,
            workflowName: "billing",
            tracingDisabled: true,
        });

        expect(runner.config).toMatchObject({ workflowName: "billing", tracingDisabled: true });
    });

    it.each([
        ["a plain client", false],
        ["a client from quard.wrap()", true],
    ])("sends each model call through the monitor once, given %s", async (_name, wrapFirst) => {
        const { client, bodies } = scriptedClient({ billing: [{ text: "Paid." }] });

        await quardRunner({ client: wrapFirst ? quard.wrap(client) : client }).run(testAgent("billing"), "Pay.");

        expect(bodies).toHaveLength(1);
        // The Responses API, which the monitor reads
        expect(bodies[0]).toMatchObject({ model: "test-model", instructions: "billing" });
        expect(modelCalls(events)).toEqual([expect.objectContaining({ agent: "billing", model: "test-model" })]);
    });
});
