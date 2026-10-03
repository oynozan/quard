import { describe, expect, it } from "vitest";
import { clientMessage, serverMessage } from "./protocol.ts";

const ID = "a".repeat(16);

describe("label lookups and run counters", () => {
    it.each([
        { type: "lookup", id: ID, target: { kind: "message", ref: "b".repeat(16) } },
        { type: "lookup", id: ID, target: { kind: "memory", print: "c".repeat(64) } },
        { type: "run_count", id: ID, runId: "d".repeat(32), counter: "steps", add: 1, max: 200 },
        { type: "run_count", id: ID, runId: "d".repeat(32), counter: "amount:pay:amount", add: 4950 },
    ])("reads a $type message from the SDK", (message) => {
        expect(clientMessage.parse(message)).toEqual(message);
    });

    it("refuses a memory lookup by reference and an unknown counter", () => {
        expect(
            clientMessage.safeParse({ type: "lookup", id: ID, target: { kind: "memory", ref: "b".repeat(16) } })
                .success,
        ).toBe(false);
        expect(
            clientMessage.safeParse({ type: "run_count", id: ID, runId: "d".repeat(32), counter: "helpers", add: 1 })
                .success,
        ).toBe(false);
    });

    it("reads control's answer to a lookup", () => {
        expect(serverMessage.parse({ type: "labels", id: ID, records: [] })).toEqual({
            type: "labels",
            id: ID,
            records: [],
        });
    });
});
