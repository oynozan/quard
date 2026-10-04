import type { RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { quard } from "../../index.ts";
import { decisionsOf } from "../../test/events.ts";
import { scriptedClient, testAgent } from "../../test/openai-agents.ts";
import { resetAll } from "../../test/reset.ts";
import { quardRunner } from "./runner.ts";
import { guardedTool } from "./tool.ts";

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event), runLimits: { mode: "block" } });
});

afterEach(() => {
    resetAll();
});

describe("handoffs back and forth", () => {
    it("leave the depth alone, so a first real delegation is not over the depth limit", async () => {
        const send = vi.fn(async () => "sent");
        const delegate = guardedTool({
            name: "delegate",
            description: "Send work to another agent",
            parameters: z.object({ to: z.string() }),
            execute: send,
            guard: { type: "limit", delegateTo: "to" },
        });
        const a = testAgent("a", { tools: [delegate] });
        const b = testAgent("b", { handoffs: [a] });
        a.handoffs = [b];
        const toA = { calls: [{ name: "transfer_to_a", args: {} }] };
        const toB = { calls: [{ name: "transfer_to_b", args: {} }] };
        const { client } = scriptedClient({
            a: [toB, toB, { calls: [{ name: "delegate", args: { to: "c" } }] }, { text: "Done." }],
            b: [toA, toA],
        });

        await quardRunner({ client }).run(a, "Plan the work.");

        expect(events.filter((event) => event.type === "handoff")).toHaveLength(4);
        const depth = decisionsOf(events).find((event) => event.rule === "max-depth");
        expect(depth).toMatchObject({ agent: "a", decision: "allow" });
        expect(send).toHaveBeenCalledTimes(1);
    });
});
