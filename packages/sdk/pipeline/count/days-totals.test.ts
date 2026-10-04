import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FailResult } from "../../guards/call.ts";
import { checkDaily, dayUsed, utcDay } from "../../guards/limit/daily.ts";
import type { LimitOptions } from "../../guards/options.ts";
import { makeAskableCall } from "../../test/call.ts";
import { counted, takenDays } from "../../test/day-counts.ts";
import { fakeSockets, READY, sentOf } from "../../test/fake-socket.ts";
import { resetAll } from "../../test/reset.ts";
import { setActiveControl } from "../../transport/link/active.ts";
import { createControl, type Control } from "../../transport/link/control.ts";
import { countCall } from "./count.ts";

const DAY = "2026-10-03";
const PAY: LimitOptions = { type: "limit", maxAmountPerDay: { field: "amount", max: 50000 } };
const ABORTED: FailResult = {
    guard: "abort",
    rule: "aborted",
    decision: "block",
    mode: "block",
    reason: "call_aborted",
};

let control: Control | undefined;

function linked() {
    const fake = fakeSockets();
    control = createControl({ url: "ws://c", key: "k", open: fake.open });
    setActiveControl(control);
    return { fake, socket: fake.connect() };
}

// The day's amount as this process knows it
const amount = () => dayUsed(utcDay(), "payInvoice", "amount:amount");

const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse(`${DAY}T12:00:00.000Z`) });
});

afterEach(() => {
    control?.stop();
    control = undefined;
    resetAll();
    vi.useRealTimers();
});

describe("the day's total here once refused calls give their counts back", () => {
    it("ends at control's total when two calls are refused while counted, answered in separate ticks", async () => {
        const { socket } = linked();
        let aborted = false;
        const after = () => (aborted ? ABORTED : undefined);

        const first = countCall(makeAskableCall({ amount: 45000 }), [PAY], [], after);
        const second = countCall(makeAskableCall({ amount: 1000 }), [PAY], [], after);
        await settle();
        const [one, two] = sentOf(socket, "count");
        aborted = true;
        socket.reply(counted(one?.id, true, [45000]));
        await settle();
        socket.reply(counted(two?.id, true, [46000]));

        expect([await first, await second]).toEqual([ABORTED, ABORTED]);
        // Control ends at 46000 less both take-backs
        expect(takenDays(socket).map(({ add }) => add)).toEqual([45000, 1000]);
        expect(amount()).toBe(0);
    });

    it("ends at control's total when a count's answer comes after a refused call took its counts back", async () => {
        const { socket } = linked();
        const list: LimitOptions[] = [{ ...PAY, fleetCheck: ["url"] }];
        const fleetResult = (id: string | undefined, quarantined: Array<{ key: string; observe: boolean }>) =>
            ({ type: "fleet_result", id: id as string, quarantined, fleetObserveUntil: null }) as const;

        const first = countCall(makeAskableCall({ url: "https://evil-pay.com", amount: 45000 }), list, []);
        await settle();
        socket.reply(counted(sentOf(socket, "count")[0]?.id, true, [45000]));
        await settle();
        const second = countCall(makeAskableCall({ url: "https://acme.com", amount: 1000 }), list, []);
        await settle();
        // Control counted the second call before the first one gave its counts back
        socket.reply(fleetResult(sentOf(socket, "fleet")[0]?.id, [{ key: "domain:evil-pay.com", observe: false }]));
        expect(await first).toMatchObject({ reason: "value_quarantined" });
        socket.reply(counted(sentOf(socket, "count")[1]?.id, true, [46000]));
        await settle();
        socket.reply(fleetResult(sentOf(socket, "fleet")[1]?.id, []));

        expect(await second).toBeUndefined();
        expect(amount()).toBe(1000);
        expect(checkDaily(makeAskableCall({ amount: 5000 }), PAY, "block")).toMatchObject([{ decision: "allow" }]);
    });

    it("ends at control's total when the link drops before a refused call can give its counts back", async () => {
        const { fake, socket } = linked();
        const after = () => {
            socket.drop();
            return ABORTED;
        };

        const refused = countCall(makeAskableCall({ amount: 45000 }), [PAY], [], after);
        await settle();
        socket.reply(counted(sentOf(socket, "count")[0]?.id, true, [45000]));
        expect(await refused).toBe(ABORTED);
        vi.advanceTimersByTime(1000);
        // Control still holds the call's counts when the link is back
        const counters = [{ tool: "payInvoice", counter: "amount:amount", day: DAY, used: 45000 }];
        const again = fake.connect({ ...READY, counters });

        expect(takenDays(again)).toEqual([{ tool: "payInvoice", day: DAY, counter: "amount:amount", add: 45000 }]);
        expect(amount()).toBe(0);
    });
});
