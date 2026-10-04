import { parseHashKey } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takeEvents } from "../../core/recorder.ts";
import type { RuleResult } from "../../guards/call.ts";
import type { LimitOptions } from "../../guards/options.ts";
import { makeAskableCall } from "../../test/call.ts";
import { decisionsOf } from "../../test/events.ts";
import { fakeSockets, sentOf } from "../../test/fake-socket.ts";
import { resetAll } from "../../test/reset.ts";
import { createControl, type Control } from "../../transport/link/control.ts";
import { countRuns } from "./runs.ts";

const CALLS: LimitOptions = { type: "limit", maxCallsPerRun: 1 };
const AMOUNT: LimitOptions = { type: "limit", maxAmountPerRun: { field: "amount", max: 100 } };
const OVER: RuleResult = {
    guard: "limit",
    rule: "max-calls-per-run",
    decision: "block",
    mode: "observe",
    reason: "limit_reached",
};

let control: Control | undefined;

function setup() {
    const fake = fakeSockets();
    control = createControl({ url: "ws://c", key: "k", hashKey: parseHashKey("ab".repeat(32)), open: fake.open });
    return { fake, control };
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    control?.stop();
    control = undefined;
    resetAll();
    vi.useRealTimers();
});

describe("countRuns without control", () => {
    it("counts in the run and refuses a call past the cap", async () => {
        const call = makeAskableCall({});

        expect(await countRuns(call, [CALLS], undefined, [])).toBeUndefined();
        expect(await countRuns(call, [CALLS], undefined, [])).toMatchObject({
            rule: "max-calls-per-run",
            mode: "block",
            reason: "limit_reached",
        });

        expect(call.run.counters.get("calls:payInvoice")).toBe(1);
        expect(decisionsOf(takeEvents()).map((event) => event.rule)).toEqual(["max-calls-per-run"]);
    });

    it("does nothing for calls that add nothing", async () => {
        const call = makeAskableCall({ amount: 0 });

        expect(await countRuns(call, [{ type: "limit" }], undefined, [])).toBeUndefined();
        expect(await countRuns(call, [AMOUNT], undefined, [])).toBeUndefined();
        expect(takeEvents()).toEqual([]);
        expect(call.run.counters.size).toBe(0);
    });

    it("lets observe mode run, and records 'would block' once", async () => {
        const observe = { ...CALLS, mode: "observe" as const };
        const call = makeAskableCall({});
        await countRuns(call, [observe], undefined, []);

        expect(await countRuns(call, [observe], undefined, [])).toBeUndefined();
        expect(await countRuns(call, [observe], undefined, [OVER])).toBeUndefined();

        expect(call.run.counters.get("calls:payInvoice")).toBe(3);
        expect(decisionsOf(takeEvents())).toMatchObject([{ decision: "block", mode: "observe", enforced: false }]);
    });

    it("adds a counter two guards share once per call", async () => {
        const call = makeAskableCall({});
        const list: LimitOptions[] = [CALLS, { type: "limit", maxCallsPerRun: 5 }];

        expect(await countRuns(call, list, undefined, [])).toBeUndefined();
        expect(call.run.counters.get("calls:payInvoice")).toBe(1);
    });
});

describe("countRuns through control", () => {
    it("sends the smallest enforced cap, and refuses what control refuses", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const call = makeAskableCall({ amount: 80 });
        const list: LimitOptions[] = [
            { ...CALLS, ...AMOUNT },
            { type: "limit", maxCallsPerRun: 3 },
        ];

        const counted = countRuns(call, list, control, []);
        const sent = sentOf(socket, "run_count");
        expect(sent.map(({ runId, counts }) => ({ runId, counts }))).toEqual([
            {
                runId: call.runId,
                counts: [
                    { counter: "calls:payInvoice", add: 1, max: 1 },
                    { counter: "amount:payInvoice:amount", add: 80, max: 100 },
                ],
            },
        ]);
        // Control adds neither, since the amount would pass its cap
        socket.reply({ type: "run_counted", id: sent[0]?.id as string, ok: false, used: [0, 90] });

        expect(await counted).toMatchObject({ rule: "max-amount-per-run", mode: "block", reason: "limit_reached" });
        expect(call.run.counters.get("calls:payInvoice")).toBe(0);
        expect(call.run.counters.get("amount:payInvoice:amount")).toBe(90);
    });

    it("sends no cap in observe mode, and records 'would block' from control's total", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();

        const counted = countRuns(makeAskableCall({}), [{ ...CALLS, mode: "observe" }], control, []);
        const [count] = sentOf(socket, "run_count");
        socket.reply({ type: "run_counted", id: count?.id as string, ok: true, used: [2] });

        expect(count?.counts).toEqual([{ counter: "calls:payInvoice", add: 1 }]);
        expect(await counted).toBeUndefined();
        expect(decisionsOf(takeEvents())).toMatchObject([{ rule: "max-calls-per-run", mode: "observe" }]);
    });
});
