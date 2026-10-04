import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDayCounts, dayUsed } from "../../guards/limit/daily.ts";
import { fakeLink, sentOf, type FakeSocket } from "../../test/fake-socket.ts";
import { createReplays, type FleetUse } from "./queue.ts";
import { createRequests } from "./requests.ts";

const DAY = "2026-10-03";
const USE: FleetUse = {
    runId: "a".repeat(32),
    agent: "billing",
    tool: "payInvoice",
    blocked: true,
    values: [{ field: "url", kind: "domain", key: "domain:evil.com" }],
};

function setup() {
    const { fake, link } = fakeLink();
    const requests = createRequests(link);
    return { fake, link, replays: createReplays(link, requests, 5000) };
}

// Lets the replies' promise callbacks run
const settle = () => vi.advanceTimersByTimeAsync(0);

// Each count sent, with its tool and day
const replayed = (socket: FakeSocket) =>
    sentOf(socket, "count").flatMap(({ tool, day, counts }) => counts.map((count) => ({ tool, day, ...count })));

// Each count taken back, with its tool and day
const takenBack = (socket: FakeSocket) =>
    sentOf(socket, "uncount").flatMap(({ tool, day, counts }) => counts.map((count) => ({ tool, day, ...count })));

beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse(`${DAY}T12:00:00.000Z`) });
});

afterEach(() => {
    clearDayCounts();
    vi.useRealTimers();
});

describe("replays for control", () => {
    it("adds up counts made while control was away and sends them, without a cap, once it is back", async () => {
        const { fake, replays } = setup();
        replays.keepCount({ day: DAY, tool: "pay", counter: "calls", add: 1 });
        replays.keepCount({ day: DAY, tool: "pay", counter: "calls", add: 2 });
        replays.keepCount({ day: DAY, tool: "pay", counter: "amount:amount", add: 50 });

        const socket = fake.connect();
        expect(replayed(socket)).toEqual([
            { tool: "pay", counter: "calls", day: DAY, add: 3 },
            { tool: "pay", counter: "amount:amount", day: DAY, add: 50 },
        ]);
        socket.reply({ type: "counted", id: sentOf(socket, "count")[0]?.id as string, ok: true, used: [7] });
        await settle();

        expect(dayUsed(DAY, "pay", "calls")).toBe(7);
    });

    it("keeps a count control did not answer, for the next reconnect", async () => {
        const { fake, replays } = setup();
        replays.keepCount({ day: DAY, tool: "pay", counter: "calls", add: 1 });
        fake.connect().drop();
        await settle();

        vi.advanceTimersByTime(1000);
        const again = fake.connect();

        expect(replayed(again).map(({ add }) => add)).toEqual([1]);
    });

    it("forgets counts control turned out to have, and takes back what it got twice", () => {
        const { fake, replays } = setup();
        const count = { day: DAY, tool: "pay", counter: "calls", add: 2 };
        replays.keepCount(count);
        replays.keepCount(count);
        replays.dropCount(count);
        replays.dropCount({ ...count, counter: "amount:amount" });
        replays.keepCount({ ...count, tool: "other" });
        replays.dropCount({ ...count, tool: "other", add: 5 });

        const socket = fake.connect();

        expect(replayed(socket).map(({ tool, counter, add }) => [tool, counter, add])).toEqual([["pay", "calls", 2]]);
        expect(takenBack(socket).map(({ tool, counter, add }) => [tool, counter, add])).toEqual([
            ["pay", "amount:amount", 2],
            ["other", "calls", 3],
        ]);
    });

    it("takes counts back from control at once while it is there", async () => {
        const { fake, replays } = setup();
        const socket = fake.connect();

        replays.takeBack(DAY, "pay", [
            { counter: "calls", add: 1 },
            { counter: "amount:amount", add: 50 },
        ]);

        expect(sentOf(socket, "uncount").map(({ tool, day, counts }) => ({ tool, day, counts }))).toEqual([
            {
                tool: "pay",
                day: DAY,
                counts: [
                    { counter: "calls", add: 1 },
                    { counter: "amount:amount", add: 50 },
                ],
            },
        ]);
        socket.drop();
        await settle();
        vi.advanceTimersByTime(1000);
        expect(takenBack(fake.connect())).toEqual([]);
    });

    it("keeps counts to take back while control is away, net of the counts kept for it", () => {
        const { fake, replays } = setup();
        replays.keepCount({ day: DAY, tool: "pay", counter: "calls", add: 1 });
        replays.takeBack(DAY, "pay", [
            { counter: "calls", add: 3 },
            { counter: "amount:amount", add: 50 },
        ]);
        replays.keepCount({ day: DAY, tool: "pay", counter: "amount:amount", add: 50 });

        const socket = fake.connect();

        expect(replayed(socket)).toEqual([]);
        expect(takenBack(socket)).toEqual([{ tool: "pay", day: DAY, counter: "calls", add: 2 }]);
    });

    it("sends a fleet report at once while control is there", async () => {
        const { fake, replays } = setup();
        const socket = fake.connect();

        replays.use(USE);

        const [sent] = sentOf(socket, "fleet");
        expect(sent).toMatchObject(USE);
        expect(socket.held).toBe(false);
        socket.reply({ type: "fleet_result", id: sent?.id as string, quarantined: [], fleetObserveUntil: null });
        await settle();
        socket.drop();
        vi.advanceTimersByTime(1000);
        expect(sentOf(fake.connect(), "fleet")).toEqual([]);
    });

    it("keeps fleet reports while control is away, and those it did not answer", async () => {
        const { fake, replays } = setup();
        replays.use(USE);
        const socket = fake.connect();
        expect(sentOf(socket, "fleet")).toHaveLength(1);

        socket.drop();
        await settle();
        vi.advanceTimersByTime(1000);

        expect(sentOf(fake.connect(), "fleet")).toHaveLength(1);
    });

    it("sends what is left again while the link stays up", async () => {
        const { fake, replays } = setup();
        const socket = fake.connect();

        replays.keepCount({ day: DAY, tool: "pay", counter: "calls", add: 1 });
        replays.keepUse(USE);
        vi.advanceTimersByTime(30_000);

        expect(replayed(socket).map(({ add }) => add)).toEqual([1]);
        expect(sentOf(socket, "fleet")).toHaveLength(1);
    });

    it("waits for the link when it drops before the next try", async () => {
        const { fake, replays } = setup();
        const socket = fake.connect();
        replays.keepCount({ day: DAY, tool: "pay", counter: "calls", add: 1 });

        socket.drop();
        vi.advanceTimersByTime(30_000);
        const again = fake.connect();

        expect(sentOf(socket, "count")).toEqual([]);
        expect(replayed(again).map(({ add }) => add)).toEqual([1]);
    });

    it("forgets a replayed count or report that control answers late", async () => {
        const { fake, replays } = setup();
        replays.keepCount({ day: DAY, tool: "pay", counter: "calls", add: 1 });
        replays.keepUse(USE);
        const socket = fake.connect();
        const [count] = sentOf(socket, "count");
        const [use] = sentOf(socket, "fleet");

        vi.advanceTimersByTime(5000);
        await settle();
        socket.reply({ type: "counted", id: count?.id as string, ok: true, used: [4] });
        socket.reply({ type: "fleet_result", id: use?.id as string, quarantined: [], fleetObserveUntil: null });
        vi.advanceTimersByTime(30_000);
        socket.drop();
        vi.advanceTimersByTime(1000);

        expect([sentOf(socket, "count"), sentOf(socket, "fleet")].map((sent) => sent.length)).toEqual([1, 1]);
        expect(sentOf(fake.connect(), "count")).toEqual([]);
        expect(sentOf(fake.last(), "fleet")).toEqual([]);
        expect(dayUsed(DAY, "pay", "calls")).toBe(4);
    });

    it("sends a slow replay again when the link drops before control answers", async () => {
        const { fake, replays } = setup();
        replays.keepCount({ day: DAY, tool: "pay", counter: "calls", add: 1 });
        replays.keepUse(USE);
        const socket = fake.connect();

        vi.advanceTimersByTime(5000);
        await settle();
        socket.drop();
        vi.advanceTimersByTime(1000);
        const again = fake.connect();

        expect([sentOf(again, "count"), sentOf(again, "fleet")].map((sent) => sent.length)).toEqual([1, 1]);
    });

    it("forgets a fleet report control turned out to have, and keeps at most 1000", () => {
        const { fake, replays } = setup();
        const uses = Array.from({ length: 1001 }, (_, n) => ({ ...USE, agent: `agent-${n}` }));
        uses.forEach((use) => replays.keepUse(use));
        replays.dropUse(uses[1000] as FleetUse);
        replays.dropUse(USE);

        const sent = sentOf(fake.connect(), "fleet");

        expect(sent).toHaveLength(999);
        expect(sent[0]?.agent).toBe("agent-1");
    });
});
