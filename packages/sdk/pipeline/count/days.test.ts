import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takeEvents } from "../../core/recorder.ts";
import type { RuleResult } from "../../guards/call.ts";
import { dayUsed, utcDay } from "../../guards/limit/daily.ts";
import type { LimitOptions } from "../../guards/options.ts";
import { makeAskableCall } from "../../test/call.ts";
import { AMOUNT, CALLS, counted, dayControl, reconnect, sentDays } from "../../test/day-counts.ts";
import { decisionsOf } from "../../test/events.ts";
import { sentOf } from "../../test/fake-socket.ts";
import { resetAll } from "../../test/reset.ts";
import type { Control } from "../../transport/link/control.ts";
import { countDays } from "./days.ts";

const OVER: RuleResult = {
    guard: "limit",
    rule: "max-calls-per-day",
    decision: "block",
    mode: "observe",
    reason: "daily_limit_reached",
};

let control: Control | undefined;

function setup() {
    const made = dayControl();
    control = made.control;
    return made;
}

beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse("2026-10-03T12:00:00.000Z") });
});

afterEach(() => {
    control?.stop();
    control = undefined;
    resetAll();
    vi.useRealTimers();
});

describe("countDays without control", () => {
    it("counts in this process and refuses a call past the cap", async () => {
        const call = makeAskableCall({});

        expect(await countDays(call, [CALLS], undefined, [])).toBeUndefined();
        expect(await countDays(call, [CALLS], undefined, [])).toMatchObject({
            rule: "max-calls-per-day",
            mode: "block",
            reason: "daily_limit_reached",
        });

        expect(dayUsed(utcDay(), "payInvoice", "calls")).toBe(1);
        expect(decisionsOf(takeEvents()).map((event) => event.rule)).toEqual(["max-calls-per-day"]);
    });

    it("does nothing for calls that add nothing", async () => {
        const call = makeAskableCall({ amount: 0 });

        expect(await countDays(call, [{ type: "limit" }], undefined, [])).toBeUndefined();
        expect(await countDays(call, [AMOUNT], undefined, [])).toBeUndefined();
        expect(takeEvents()).toEqual([]);
    });

    it("lets observe mode run, and records 'would block' once", async () => {
        const observe = { ...CALLS, mode: "observe" as const };
        const call = makeAskableCall({});
        await countDays(call, [observe], undefined, []);

        expect(await countDays(call, [observe], undefined, [])).toBeUndefined();
        expect(await countDays(call, [observe], undefined, [OVER])).toBeUndefined();

        expect(dayUsed(utcDay(), "payInvoice", "calls")).toBe(3);
        expect(decisionsOf(takeEvents())).toMatchObject([{ decision: "block", mode: "observe", enforced: false }]);
    });
});

describe("countDays with several guards on one tool", () => {
    it("adds a shared counter once per call, and checks each guard's cap against it", async () => {
        const call = makeAskableCall({});
        const list: LimitOptions[] = [CALLS, { type: "limit", maxCallsPerDay: 5 }];

        expect(await countDays(call, list, undefined, [])).toBeUndefined();
        expect(dayUsed(utcDay(), "payInvoice", "calls")).toBe(1);
        expect(await countDays(call, list, undefined, [])).toMatchObject({ rule: "max-calls-per-day", mode: "block" });
        expect(dayUsed(utcDay(), "payInvoice", "calls")).toBe(1);
    });

    it("sends one count with the smallest cap of the guards that block", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const list: LimitOptions[] = [
            { ...CALLS, mode: "observe" },
            { type: "limit", maxCallsPerDay: 5 },
            { type: "limit", maxCallsPerDay: 3 },
        ];

        const result = countDays(makeAskableCall({}), list, control, []);
        const [sent] = sentOf(socket, "count");
        socket.reply(counted(sent?.id, true, [2]));

        expect(sent?.counts).toEqual([{ counter: "calls", add: 1, max: 3 }]);
        expect(await result).toBeUndefined();
        expect(decisionsOf(takeEvents())).toMatchObject([{ rule: "max-calls-per-day", mode: "observe" }]);
    });
});

describe("countDays through control", () => {
    it("sends all of a call's counts in one message with the caps of block mode, and takes control's totals", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const call = makeAskableCall({ amount: 80 });

        const result = countDays(
            call,
            [
                { ...CALLS, ...AMOUNT },
                { ...CALLS, maxCallsPerDay: 9, mode: "observe" },
            ],
            control,
            [],
        );
        const [sent] = sentOf(socket, "count");
        expect(sent).toMatchObject({ tool: "payInvoice", day: "2026-10-03" });
        expect(sent?.counts).toEqual([
            { counter: "calls", add: 1, max: 1 },
            { counter: "amount:amount", add: 80, max: 100 },
        ]);
        socket.reply(counted(sent?.id, true, [1, 95]));

        expect(await result).toBeUndefined();
        expect([dayUsed(utcDay(), "payInvoice", "calls"), dayUsed(utcDay(), "payInvoice", "amount:amount")]).toEqual([
            1, 95,
        ]);
    });

    it("adds the call to none of the counters when control refuses one, and refuses the call", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();

        const result = countDays(
            makeAskableCall({ amount: 80 }),
            [{ ...CALLS, maxCallsPerDay: 10 }, AMOUNT],
            control,
            [],
        );
        const [sent] = sentOf(socket, "count");
        socket.reply(counted(sent?.id, false, [3, 90]));

        expect(await result).toMatchObject({
            rule: "max-amount-per-day",
            mode: "block",
            reason: "daily_limit_reached",
        });
        expect([dayUsed(utcDay(), "payInvoice", "calls"), dayUsed(utcDay(), "payInvoice", "amount:amount")]).toEqual([
            3, 90,
        ]);
        expect(sentDays(await reconnect(fake))).toEqual([]);
    });

    it("sends no cap in observe mode, and records 'would block' from control's total", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();

        const result = countDays(makeAskableCall({}), [{ ...CALLS, mode: "observe" }], control, []);
        const [sent] = sentOf(socket, "count");
        socket.reply(counted(sent?.id, true, [2]));

        expect(sent?.counts).toEqual([{ counter: "calls", add: 1 }]);
        expect(await result).toBeUndefined();
        expect(decisionsOf(takeEvents())).toMatchObject([{ rule: "max-calls-per-day", mode: "observe" }]);
    });

    it("counts here when control's answer has the wrong number of totals", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();

        const result = countDays(makeAskableCall({}), [CALLS], control, []);
        const [sent] = sentOf(socket, "count");
        socket.reply(counted(sent?.id, true, [3, 4]));

        expect(await result).toBeUndefined();
        expect(dayUsed(utcDay(), "payInvoice", "calls")).toBe(1);
    });

    it("counts here a call with more counts than one message takes", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const fields = Array.from({ length: 20 }, (_, n) => `a${n}`);
        const list: LimitOptions[] = [
            CALLS,
            ...fields.map((field) => ({ type: "limit" as const, maxAmountPerDay: { field, max: 9 } })),
        ];
        const call = makeAskableCall(Object.fromEntries(fields.map((field) => [field, 1])));

        expect(await countDays(call, list, control, [])).toBeUndefined();

        expect(sentDays(socket)).toEqual([]);
        expect(sentDays(await reconnect(fake))).toEqual([]);
        expect([dayUsed(utcDay(), "payInvoice", "calls"), dayUsed(utcDay(), "payInvoice", "amount:a19")]).toEqual([
            1, 1,
        ]);
    });

    it("keeps a counter whose name control can't take in this process", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const field = "f".repeat(200);

        const call = makeAskableCall({ [field]: 5 });
        expect(
            await countDays(call, [{ type: "limit", maxAmountPerDay: { field, max: 9 } }], control, []),
        ).toBeUndefined();

        expect(sentDays(socket)).toEqual([]);
        expect(sentDays(await reconnect(fake))).toEqual([]);
        expect(dayUsed(utcDay(), "payInvoice", `amount:${field}`)).toBe(5);
    });
});
