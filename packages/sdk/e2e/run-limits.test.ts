import type { RunEvent } from "@quard/shared";
import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { guard, isGuardRefusal, quard } from "../index.ts";
import { fakeResponses } from "../test/fake-responses.ts";
import { resetAll } from "../test/reset.ts";

// The run limits from Q15: delegation depth and fan-out on a guarded
// delegate tool, and steps and cost on the wrapped client.

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
});

// Limit decisions that blocked, or would have in observe mode
function overLimits(): Array<[string, string, string, boolean]> {
    return events.flatMap((event) =>
        event.type === "decision" && event.guard === "limit" && event.decision === "block"
            ? [[event.rule, event.agent, event.mode, event.enforced] as [string, string, string, boolean]]
            : [],
    );
}

// Each helper runs as a child agent and hands the rest of the chain on
function makeDelegate() {
    const reached: string[] = [];
    const raw = async (input: { to: string; chain: string[] }): Promise<unknown> => {
        reached.push(input.to);
        return quard.agent(input.to, async () => {
            const [next, ...rest] = input.chain;
            return next === undefined ? "done" : delegate({ to: next, chain: rest });
        });
    };
    const delegate = guard(raw, { type: "limit", name: "delegate", delegateTo: "to" });
    return { delegate, reached };
}

// With a1, the boss hands off to 11 distinct helpers, one past the fan-out limit
const HELPERS = Array.from({ length: 10 }, (_, i) => `helper${i + 1}`);

async function deepAndWide() {
    const { delegate, reached } = makeDelegate();
    const results = await quard.run({ agent: "boss" }, async () => {
        const deep = await delegate({ to: "a1", chain: ["a2", "a3", "a4"] });
        const wide = [];
        for (const to of HELPERS) {
            wide.push(await delegate({ to, chain: [] }));
        }
        const again = await delegate({ to: "helper1", chain: [] });
        return { deep, wide, again };
    });
    return { ...results, reached };
}

describe("delegation limits", () => {
    it("record would-block decisions in observe mode and let the run go on", async () => {
        const { deep, wide, again, reached } = await deepAndWide();

        expect(deep).toBe("done");
        expect(wide.every((result) => result === "done")).toBe(true);
        expect(again).toBe("done");
        expect(reached).toEqual(["a1", "a2", "a3", "a4", ...HELPERS, "helper1"]);
        // The 11th helper ran, so the boss stays over the limit after it
        expect(overLimits()).toEqual([
            ["max-depth", "a3", "observe", false],
            ["max-fan-out", "boss", "observe", false],
            ["max-fan-out", "boss", "observe", false],
        ]);
    });

    it("refuse the handoff in block mode", async () => {
        quard.configure({ runLimits: { mode: "block" } });

        const { deep, wide, again, reached } = await deepAndWide();

        // The refused helper was not counted, so a helper already used still runs
        expect(again).toBe("done");
        expect(reached).toEqual(["a1", "a2", "a3", ...HELPERS.slice(0, 9), "helper1"]);
        expect(deep).toMatchObject({ blocked: true, guard: "limit", reason: "limit_reached" });
        expect(wide.filter(isGuardRefusal)).toHaveLength(1);
        expect(overLimits()).toEqual([
            ["max-depth", "a3", "block", true],
            ["max-fan-out", "boss", "block", true],
        ]);
    });
});

describe("loop limit", () => {
    it("refuses the sixth turn between the same two agents in block mode", async () => {
        quard.configure({ runLimits: { mode: "block" } });
        const send = guard(async (message: { to: string }) => `to ${message.to}`, {
            type: "limit",
            name: "send",
            delegateTo: "to",
        });

        const replies = await quard.run({ agent: "boss" }, async () => {
            const sent: unknown[] = [];
            for (let turn = 0; turn < 6; turn++) {
                const [from, to] = turn % 2 === 0 ? ["writer", "critic"] : ["critic", "writer"];
                sent.push(await quard.agent(from, () => send({ to })));
            }
            return sent;
        });

        expect(replies.slice(0, 5)).toEqual(["to critic", "to writer", "to critic", "to writer", "to critic"]);
        expect(replies[5]).toMatchObject({ blocked: true, guard: "limit", reason: "limit_reached" });
        expect(overLimits()).toEqual([["max-loops", "critic", "block", true]]);
    });
});

// 1M fresh input tokens of gpt-5.4-mini cost $0.75
const USAGE = { input_tokens: 1_000_000, output_tokens: 0 };

function client() {
    const fake = fakeResponses(() => ({ text: "ok", usage: USAGE }));
    // The client's default retries stay on, so a retried refusal would show
    const openai = quard.wrap(new OpenAI({ apiKey: "test", fetch: fake.fetch }));
    const ask = (input: string) => openai.responses.create({ model: "gpt-5.4-mini", input });
    return { ask, bodies: fake.bodies };
}

describe("step and cost limits", () => {
    it("record would-block decisions in observe mode and send the calls", async () => {
        quard.configure({ runLimits: { steps: 2, costUsd: 1 } });
        const { ask, bodies } = client();

        await quard.run({ agent: "boss" }, async () => {
            await ask("one");
            await ask("two");
            await ask("three");
        });

        expect(bodies).toHaveLength(3);
        // Cost was $0.75 before the second call and $1.50 before the third
        expect(overLimits()).toEqual([
            ["max-steps", "boss", "observe", false],
            ["max-cost", "boss", "observe", false],
        ]);
    });

    it.each([
        ["steps", { steps: 1 }, "max-steps"],
        ["cost", { costUsd: 0.75 }, "max-cost"],
    ])("stop the run in block mode when %s run out", async (_, limits, rule) => {
        quard.configure({ runLimits: { mode: "block", ...limits } });
        const { ask, bodies } = client();

        const error = await quard
            .run({ agent: "boss" }, async () => {
                await ask("one");
                await ask("two");
            })
            .catch((thrown: unknown) => thrown);

        expect(bodies).toHaveLength(1);
        // The app gets the client's own 403 error, not retried, and the run ends blocked
        expect(error).toBeInstanceOf(OpenAI.PermissionDeniedError);
        expect(error).toMatchObject({ status: 403, type: "quard_blocked", code: "limit_reached" });
        expect(overLimits()).toEqual([[rule, "boss", "block", true]]);
        expect(events.find((event) => event.type === "run_finished")).toMatchObject({ status: "blocked" });
    });
});

describe("a copy of a wrapped client", () => {
    it("counts each call once when it is wrapped again", async () => {
        quard.configure({ runLimits: { mode: "block", steps: 2, costUsd: 1.5 } });
        const fake = fakeResponses(() => ({ text: "ok", usage: USAGE }));
        const base = quard.wrap(new OpenAI({ apiKey: "test", fetch: fake.fetch, maxRetries: 0 }));
        const openai = quard.wrap(base.withOptions({ timeout: 30_000 }));

        await quard.run({ agent: "boss" }, async () => {
            await openai.responses.create({ model: "gpt-5.4-mini", input: "one" });
            await openai.responses.create({ model: "gpt-5.4-mini", input: "two" });
        });

        // Counted twice, the second call would pass $0.75 x 2 and step 2 x 2
        expect(fake.bodies).toHaveLength(2);
        expect(events.filter((event) => event.type === "model_call")).toHaveLength(2);
        expect(overLimits()).toEqual([]);
    });
});
