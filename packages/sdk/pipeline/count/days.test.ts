import { parseHashKey } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takeEvents } from "../../core/recorder.ts";
import type { RuleResult } from "../../guards/call.ts";
import { dayUsed, utcDay } from "../../guards/limit/daily.ts";
import type { LimitOptions } from "../../guards/options.ts";
import { makeAskableCall } from "../../test/call.ts";
import { decisionsOf } from "../../test/events.ts";
import { fakeSockets, sentOf } from "../../test/fake-socket.ts";
import { resetAll } from "../../test/reset.ts";
import { createControl, type Control } from "../../transport/link/control.ts";
import { countDays } from "./days.ts";

const CALLS: LimitOptions = { type: "limit", maxCallsPerDay: 1 };
const AMOUNT: LimitOptions = { type: "limit", maxAmountPerDay: { field: "amount", max: 100 } };
const OVER: RuleResult = {
    guard: "limit",
    rule: "max-calls-per-day",
    decision: "block",
    mode: "observe",
    reason: "daily_limit_reached",
};

let control: Control | undefined;

function setup() {
    const fake = fakeSockets();
    control = createControl({ url: "ws://c", key: "k", hashKey: parseHashKey("ab".repeat(32)), open: fake.open });
    return { fake, control };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

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

        const counted = countDays(makeAskableCall({}), list, control, []);
        const counts = sentOf(socket, "count");
        socket.reply({ type: "counted", id: counts[0]?.id as string, ok: true, used: 2 });

        expect(counts.map(({ add, max }) => ({ add, max }))).toEqual([{ add: 1, max: 3 }]);
        expect(await counted).toBeUndefined();
        expect(decisionsOf(takeEvents())).toMatchObject([{ rule: "max-calls-per-day", mode: "observe" }]);
    });
});

describe("countDays through control", () => {
    it("sends the cap in block mode and refuses what control refuses", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const call = makeAskableCall({ amount: 80 });

        const counted = countDays(call, [{ ...CALLS, ...AMOUNT }], control, []);
        const [calls, amount] = sentOf(socket, "count");
        expect([calls?.counter, calls?.add, calls?.max, amount?.counter, amount?.add]).toEqual([
            "calls",
            1,
            1,
            "amount:amount",
            80,
        ]);
        socket.reply({ type: "counted", id: calls?.id as string, ok: true, used: 1 });
        socket.reply({ type: "counted", id: amount?.id as string, ok: false, used: 90 });

        expect(await counted).toMatchObject({ rule: "max-amount-per-day", mode: "block" });
        expect(dayUsed(utcDay(), "payInvoice", "amount:amount")).toBe(90);
    });

    it("sends no cap in observe mode, and records 'would block' from control's total", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();

        const counted = countDays(makeAskableCall({}), [{ ...CALLS, mode: "observe" }], control, []);
        const [count] = sentOf(socket, "count");
        socket.reply({ type: "counted", id: count?.id as string, ok: true, used: 2 });

        expect(count?.max).toBeUndefined();
        expect(await counted).toBeUndefined();
        expect(decisionsOf(takeEvents())).toMatchObject([{ rule: "max-calls-per-day", mode: "observe" }]);
    });

    it("counts here while control is away, and sends the count once it is back", async () => {
        const { fake, control } = setup();

        expect(await countDays(makeAskableCall({}), [CALLS], control, [])).toBeUndefined();
        expect(await countDays(makeAskableCall({}), [CALLS], control, [])).toMatchObject({ mode: "block" });
        const socket = fake.connect();

        expect(sentOf(socket, "count").map(({ add, max }) => ({ add, max }))).toEqual([{ add: 1, max: undefined }]);
    });

    it("counts here when control is slow, and forgets the local count if control counted after all", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();

        const counted = countDays(makeAskableCall({}), [{ type: "limit", maxCallsPerDay: 5 }], control, []);
        vi.advanceTimersByTime(5000);
        expect(await counted).toBeUndefined();
        const [late] = sentOf(socket, "count");
        socket.reply({ type: "counted", id: late?.id as string, ok: true, used: 1 });

        socket.drop();
        vi.advanceTimersByTime(1000);
        expect(sentOf(fake.connect(), "count")).toEqual([]);
        expect(dayUsed(utcDay(), "payInvoice", "calls")).toBe(1);
    });

    it("keeps the local count when control's late answer is a refusal", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();

        const counted = countDays(makeAskableCall({}), [{ type: "limit", maxCallsPerDay: 5 }], control, []);
        vi.advanceTimersByTime(5000);
        await counted;
        const [late] = sentOf(socket, "count");
        socket.reply({ type: "counted", id: late?.id as string, ok: false, used: 5 });

        socket.drop();
        await settle();
        vi.advanceTimersByTime(1000);
        expect(sentOf(fake.connect(), "count")).toHaveLength(1);
        expect(dayUsed(utcDay(), "payInvoice", "calls")).toBe(5);
    });

    it("keeps the local count of a counter no guard enforces when control is slow", async () => {
        const { fake, control } = setup();
        fake.connect();

        const counted = countDays(makeAskableCall({}), [{ ...CALLS, mode: "observe" }], control, []);
        vi.advanceTimersByTime(5000);
        expect(await counted).toBeUndefined();
        fake.last().drop();
        await settle();
        vi.advanceTimersByTime(1000);

        expect(sentOf(fake.connect(), "count").map(({ add, max }) => ({ add, max }))).toEqual([
            { add: 1, max: undefined },
        ]);
    });

    it("keeps the local count when the link drops before control answers", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();

        const counted = countDays(makeAskableCall({}), [{ type: "limit", maxCallsPerDay: 5 }], control, []);
        vi.advanceTimersByTime(5000);
        await counted;
        socket.drop();
        await settle();
        vi.advanceTimersByTime(1000);

        expect(sentOf(fake.connect(), "count")).toHaveLength(1);
    });

    it("keeps nothing for later when it refuses a slow call itself", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const call = makeAskableCall({});
        await countDays(call, [CALLS], undefined, []);

        const counted = countDays(call, [CALLS], control, []);
        vi.advanceTimersByTime(5000);
        expect(await counted).toMatchObject({ mode: "block" });
        const [late] = sentOf(socket, "count");
        socket.reply({ type: "counted", id: late?.id as string, ok: true, used: 2 });

        socket.drop();
        vi.advanceTimersByTime(1000);
        expect(sentOf(fake.connect(), "count")).toEqual([]);
    });
});
