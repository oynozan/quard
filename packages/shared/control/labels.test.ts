import { describe, expect, it } from "vitest";
import { clientMessage, serverMessage } from "./protocol.ts";

const ID = "a".repeat(16);
const RUN = "d".repeat(32);

function runCount(counts: unknown[]) {
    return { type: "run_count", id: ID, runId: RUN, counts };
}

describe("label lookups and run counters", () => {
    it.each([
        { type: "lookup", id: ID, target: { kind: "message", ref: "b".repeat(16) } },
        { type: "lookup", id: ID, target: { kind: "memory", print: "c".repeat(64) } },
        runCount([{ counter: "steps", add: 1, max: 200 }]),
        runCount([
            { counter: "calls:pay", add: 1, max: 5 },
            { counter: "amount:pay:amount", add: 4950 },
        ]),
    ])("reads a $type message from the SDK", (message) => {
        expect(clientMessage.parse(message)).toEqual(message);
    });

    it("refuses a memory lookup by reference and an unknown counter", () => {
        expect(
            clientMessage.safeParse({ type: "lookup", id: ID, target: { kind: "memory", ref: "b".repeat(16) } })
                .success,
        ).toBe(false);
        expect(clientMessage.safeParse(runCount([{ counter: "helpers", add: 1 }])).success).toBe(false);
    });

    it("takes 1 to 20 counts in one run_count", () => {
        const count = { counter: "steps", add: 1 };

        expect(clientMessage.safeParse(runCount([])).success).toBe(false);
        expect(clientMessage.safeParse(runCount(Array.from({ length: 20 }, () => count))).success).toBe(true);
        expect(clientMessage.safeParse(runCount(Array.from({ length: 21 }, () => count))).success).toBe(false);
    });

    it("reads control's answers to a lookup and to a run_count", () => {
        expect(serverMessage.parse({ type: "labels", id: ID, records: [] })).toEqual({
            type: "labels",
            id: ID,
            records: [],
        });
        expect(serverMessage.parse({ type: "run_counted", id: ID, ok: false, used: [4, 900] })).toEqual({
            type: "run_counted",
            id: ID,
            ok: false,
            used: [4, 900],
        });
    });
});
