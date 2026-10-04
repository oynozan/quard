import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDayCounts, dayUsed } from "../../guards/limit/daily.ts";
import { fakeLink, READY, sentOf, type FakeSocket } from "../../test/fake-socket.ts";
import { createReplays } from "./queue.ts";
import { createRequests } from "./requests.ts";

const DAY = "2026-10-03";

function setup() {
    const { fake, link } = fakeLink();
    return { fake, replays: createReplays(link, createRequests(link), 5000) };
}

// Each count taken back, with its tool and day
const takenBack = (socket: FakeSocket) =>
    sentOf(socket, "uncount").flatMap(({ tool, day, counts }) => counts.map((count) => ({ tool, day, ...count })));

// The day's calls and amount of "pay" as this process knows them
const used = () => [dayUsed(DAY, "pay", "calls"), dayUsed(DAY, "pay", "amount:amount")];

beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse(`${DAY}T12:00:00.000Z`) });
});

afterEach(() => {
    clearDayCounts();
    vi.useRealTimers();
});

describe("control's totals as the replays note them", () => {
    it("lowers a total by the counts taken back after its count went out", () => {
        const { fake, replays } = setup();
        fake.connect();
        const noteTotals = replays.noteLater(DAY, "pay", [{ counter: "calls" }, { counter: "amount:amount" }]);
        replays.takeBack(DAY, "pay", [{ counter: "calls", add: 2 }]);
        replays.takeBack(DAY, "pay", [{ counter: "calls", add: 1 }]);
        replays.takeBack(DAY, "other", [{ counter: "amount:amount", add: 50 }]);

        noteTotals([10, 100]);

        expect(used()).toEqual([7, 100]);
    });

    it("keeps a total whole for counts taken back before its count went out", () => {
        const { fake, replays } = setup();
        fake.connect();
        replays.takeBack(DAY, "pay", [{ counter: "calls", add: 2 }]);

        replays.noteLater(DAY, "pay", [{ counter: "calls" }])([10]);

        expect(dayUsed(DAY, "pay", "calls")).toBe(10);
    });

    it("lowers a replayed count's total by a take-back still waiting to go out", async () => {
        const { fake, replays } = setup();
        replays.keepCount({ day: DAY, tool: "pay", counter: "calls", add: 1 });
        const socket = fake.connect();
        // The call was refused after its count went out again
        replays.dropCount({ day: DAY, tool: "pay", counter: "calls", add: 1 });
        socket.reply({ type: "counted", id: sentOf(socket, "count")[0]?.id as string, ok: true, used: [5] });
        await vi.advanceTimersByTimeAsync(0);

        expect(dayUsed(DAY, "pay", "calls")).toBe(4);
        vi.advanceTimersByTime(30_000);
        expect(takenBack(socket)).toEqual([{ tool: "pay", day: DAY, counter: "calls", add: 1 }]);
    });

    it("takes control's totals at connect less the counts waiting to go back to it", () => {
        const { fake, replays } = setup();
        replays.takeBack(DAY, "pay", [{ counter: "calls", add: 2 }]);

        const socket = fake.connect({
            ...READY,
            counters: [
                { tool: "pay", counter: "calls", day: DAY, used: 5 },
                { tool: "pay", counter: "amount:amount", day: DAY, used: 40 },
            ],
        });

        expect(used()).toEqual([3, 40]);
        expect(takenBack(socket)).toEqual([{ tool: "pay", day: DAY, counter: "calls", add: 2 }]);
    });
});
