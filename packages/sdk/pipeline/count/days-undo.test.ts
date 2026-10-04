import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayUsed, utcDay } from "../../guards/limit/daily.ts";
import { makeAskableCall } from "../../test/call.ts";
import { AMOUNT, CALLS, counted, dayControl, reconnect, sentDays, takenDays } from "../../test/day-counts.ts";
import { sentOf } from "../../test/fake-socket.ts";
import { resetAll } from "../../test/reset.ts";
import type { Control } from "../../transport/link/control.ts";
import { countDays } from "./days.ts";

const DAY = "2026-10-03";
const FIVE_CALLS = { ...CALLS, maxCallsPerDay: 5 };

let control: Control | undefined;

function setup() {
    const made = dayControl();
    control = made.control;
    return made;
}

// The day's calls and amount as this process knows them
const used = () => [dayUsed(utcDay(), "payInvoice", "calls"), dayUsed(utcDay(), "payInvoice", "amount:amount")];

const takeBack = (undo: Array<() => void>) => undo.forEach((giveBack) => giveBack());

beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse(`${DAY}T12:00:00.000Z`) });
});

afterEach(() => {
    control?.stop();
    control = undefined;
    resetAll();
    vi.useRealTimers();
});

describe("countDays when a later check refuses the call", () => {
    it("takes the counts back from control", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const undo: Array<() => void> = [];

        const result = countDays(makeAskableCall({ amount: 80 }), [FIVE_CALLS, AMOUNT], control, [], undo);
        socket.reply(counted(sentOf(socket, "count")[0]?.id, true, [3, 95]));
        expect(await result).toBeUndefined();
        takeBack(undo);

        expect(takenDays(socket)).toEqual([
            { tool: "payInvoice", day: DAY, counter: "calls", add: 1 },
            { tool: "payInvoice", day: DAY, counter: "amount:amount", add: 80 },
        ]);
        expect(used()).toEqual([2, 15]);
    });

    it("takes back counts kept for control without telling it", async () => {
        const { fake, control } = setup();
        const undo: Array<() => void> = [];

        expect(await countDays(makeAskableCall({ amount: 80 }), [CALLS, AMOUNT], control, [], undo)).toBeUndefined();
        takeBack(undo);

        expect(used()).toEqual([0, 0]);
        const socket = fake.connect();
        expect(sentDays(socket)).toEqual([]);
        expect(takenDays(socket)).toEqual([]);
    });

    it("frees the slot of a call counted with no control at all", async () => {
        const undo: Array<() => void> = [];

        expect(await countDays(makeAskableCall({}), [CALLS], undefined, [], undo)).toBeUndefined();
        takeBack(undo);

        expect(await countDays(makeAskableCall({}), [CALLS], undefined, [])).toBeUndefined();
    });

    it("has nothing to take back from a call it refused itself", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const undo: Array<() => void> = [];

        const result = countDays(makeAskableCall({ amount: 80 }), [FIVE_CALLS, AMOUNT], control, [], undo);
        socket.reply(counted(sentOf(socket, "count")[0]?.id, false, [3, 90]));
        expect(await result).toMatchObject({ rule: "max-amount-per-day" });
        takeBack(undo);

        expect(takenDays(socket)).toEqual([]);
        expect(used()).toEqual([3, 90]);
    });

    it("takes back counts control turned out to have after a slow answer", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const undo: Array<() => void> = [];

        const result = countDays(makeAskableCall({}), [FIVE_CALLS], control, [], undo);
        vi.advanceTimersByTime(5000);
        expect(await result).toBeUndefined();
        socket.reply(counted(sentOf(socket, "count")[0]?.id, true, [4]));
        takeBack(undo);

        expect(takenDays(socket)).toEqual([{ tool: "payInvoice", day: DAY, counter: "calls", add: 1 }]);
        expect(dayUsed(utcDay(), "payInvoice", "calls")).toBe(3);
        expect(sentDays(await reconnect(fake))).toEqual([]);
    });
});

describe("countDays when control counts a refused call late", () => {
    it("takes back the counts of a call refused after it was counted here", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const undo: Array<() => void> = [];

        const result = countDays(makeAskableCall({}), [FIVE_CALLS], control, [], undo);
        vi.advanceTimersByTime(5000);
        expect(await result).toBeUndefined();
        takeBack(undo);
        socket.reply(counted(sentOf(socket, "count")[0]?.id, true, [4]));

        expect(takenDays(socket)).toEqual([{ tool: "payInvoice", day: DAY, counter: "calls", add: 1 }]);
        expect(dayUsed(utcDay(), "payInvoice", "calls")).toBe(3);
        expect(sentDays(await reconnect(fake))).toEqual([]);
    });

    it("takes back the counts of a call it refused itself", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const call = makeAskableCall({});
        await countDays(call, [CALLS], undefined, []);

        const result = countDays(call, [CALLS], control, []);
        vi.advanceTimersByTime(5000);
        expect(await result).toMatchObject({ mode: "block" });
        // Control never heard of the first call
        socket.reply(counted(sentOf(socket, "count")[0]?.id, true, [1]));

        expect(takenDays(socket)).toEqual([{ tool: "payInvoice", day: DAY, counter: "calls", add: 1 }]);
        expect(dayUsed(utcDay(), "payInvoice", "calls")).toBe(1);
        expect(sentDays(await reconnect(fake))).toEqual([]);
    });
});
