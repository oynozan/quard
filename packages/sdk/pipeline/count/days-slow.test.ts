import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayUsed, utcDay } from "../../guards/limit/daily.ts";
import { makeAskableCall } from "../../test/call.ts";
import { AMOUNT, CALLS, counted, dayControl, reconnect, sentDays } from "../../test/day-counts.ts";
import { sentOf } from "../../test/fake-socket.ts";
import { resetAll } from "../../test/reset.ts";
import type { Control } from "../../transport/link/control.ts";
import { countDays } from "./days.ts";

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

describe("countDays while control is away or slow", () => {
    it("counts here while control is away, and sends the counts without caps once it is back", async () => {
        const { fake, control } = setup();
        const call = makeAskableCall({ amount: 80 });

        expect(await countDays(call, [{ ...CALLS, ...AMOUNT }], control, [])).toBeUndefined();
        expect(await countDays(call, [{ ...CALLS, ...AMOUNT }], control, [])).toMatchObject({ mode: "block" });

        expect(sentDays(fake.connect())).toEqual([
            { tool: "payInvoice", day: "2026-10-03", counter: "calls", add: 1, max: undefined },
            { tool: "payInvoice", day: "2026-10-03", counter: "amount:amount", add: 80, max: undefined },
        ]);
    });

    it("counts here when control is slow, and forgets the local counts if control counted after all", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();

        const result = countDays(
            makeAskableCall({ amount: 80 }),
            [{ ...CALLS, maxCallsPerDay: 5 }, AMOUNT],
            control,
            [],
        );
        vi.advanceTimersByTime(5000);
        expect(await result).toBeUndefined();
        const [late] = sentOf(socket, "count");
        socket.reply(counted(late?.id, true, [2, 85]));

        expect(sentDays(await reconnect(fake))).toEqual([]);
        expect([dayUsed(utcDay(), "payInvoice", "calls"), dayUsed(utcDay(), "payInvoice", "amount:amount")]).toEqual([
            2, 85,
        ]);
    });

    it("keeps the local count when control's late answer is a refusal", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();

        const result = countDays(makeAskableCall({}), [{ type: "limit", maxCallsPerDay: 5 }], control, []);
        vi.advanceTimersByTime(5000);
        await result;
        const [late] = sentOf(socket, "count");
        socket.reply(counted(late?.id, false, [5]));

        expect(sentDays(await reconnect(fake)).map(({ add }) => add)).toEqual([1]);
        expect(dayUsed(utcDay(), "payInvoice", "calls")).toBe(5);
    });

    it("ignores a late answer with the wrong number of totals", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();

        const result = countDays(makeAskableCall({}), [{ type: "limit", maxCallsPerDay: 5 }], control, []);
        vi.advanceTimersByTime(5000);
        await result;
        const [late] = sentOf(socket, "count");
        socket.reply(counted(late?.id, true, [4, 4]));

        expect(sentDays(await reconnect(fake)).map(({ add }) => add)).toEqual([1]);
        expect(dayUsed(utcDay(), "payInvoice", "calls")).toBe(1);
    });

    it("keeps the local count of a counter no guard enforces when control is slow", async () => {
        const { fake, control } = setup();
        fake.connect();

        const result = countDays(makeAskableCall({}), [{ ...CALLS, mode: "observe" }], control, []);
        vi.advanceTimersByTime(5000);
        expect(await result).toBeUndefined();

        expect(sentDays(await reconnect(fake)).map(({ add, max }) => ({ add, max }))).toEqual([
            { add: 1, max: undefined },
        ]);
    });

    it("keeps the local count when the link drops before control answers", async () => {
        const { fake, control } = setup();
        fake.connect();

        const result = countDays(makeAskableCall({}), [{ type: "limit", maxCallsPerDay: 5 }], control, []);
        vi.advanceTimersByTime(5000);
        await result;

        expect(sentDays(await reconnect(fake))).toHaveLength(1);
    });

    it("keeps nothing for later when it refuses a slow call itself", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const call = makeAskableCall({});
        await countDays(call, [CALLS], undefined, []);

        const result = countDays(call, [CALLS], control, []);
        vi.advanceTimersByTime(5000);
        expect(await result).toMatchObject({ mode: "block" });
        const [late] = sentOf(socket, "count");
        socket.reply(counted(late?.id, true, [2]));

        expect(sentDays(await reconnect(fake))).toEqual([]);
    });
});
