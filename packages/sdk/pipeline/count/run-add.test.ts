import { parseHashKey } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newRun } from "../../context/run.ts";
import { fakeSockets, sentOf, type FakeSocket } from "../../test/fake-socket.ts";
import { resetAll } from "../../test/reset.ts";
import { createControl, type Control } from "../../transport/link/control.ts";
import { addToRun, readCost } from "./run-add.ts";

let control: Control | undefined;

function setup() {
    const fake = fakeSockets();
    control = createControl({ url: "ws://c", key: "k", hashKey: parseHashKey("ab".repeat(32)), open: fake.open });
    return { fake, control };
}

// Each count sent, flattened, with the run it is for
const runCounts = (socket: FakeSocket) =>
    sentOf(socket, "run_count").flatMap(({ runId, counts }) =>
        counts.map(({ counter, add, max }) => ({ runId, counter, add, max })),
    );

const counted = (id: string | undefined, ok: boolean, used: number[]) =>
    ({ type: "run_counted", id: id as string, ok, used }) as const;

const settle = () => vi.advanceTimersByTimeAsync(0);

// Drops the link and reconnects, which sends what was kept
async function reconnect(fake: ReturnType<typeof fakeSockets>): Promise<FakeSocket> {
    fake.last().drop();
    await settle();
    vi.advanceTimersByTime(1000);
    return fake.connect();
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

describe("addToRun without control", () => {
    it("counts here and adds nothing past an enforced cap", async () => {
        const run = newRun();

        expect(await addToRun(undefined, run, [{ counter: "steps", add: 1, max: 1 }])).toEqual([1]);
        expect(await addToRun(undefined, run, [{ counter: "steps", add: 1, max: 1 }])).toEqual([2]);
        expect(await addToRun(undefined, run, [{ counter: "steps", add: 1, max: undefined }])).toEqual([2]);

        expect(run.modelCalls).toBe(2);
    });

    it("adds nothing to any counter when one passes its cap", async () => {
        const run = newRun();
        const adds = [
            { counter: "calls:pay", add: 1, max: undefined },
            { counter: "amount:pay:amount", add: 80, max: 50 },
        ];

        expect(await addToRun(undefined, run, adds)).toEqual([1, 80]);
        expect(run.counters.size).toBe(0);
    });
});

describe("addToRun through control", () => {
    it("sends all of a call's counts in one message with their caps, and takes control's totals", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const run = newRun();

        const added = addToRun(control, run, [
            { counter: "steps", add: 1, max: 200 },
            { counter: "calls:pay", add: 1, max: undefined },
        ]);
        const [sent] = sentOf(socket, "run_count");
        expect(sent?.counts).toEqual([
            { counter: "steps", add: 1, max: 200 },
            { counter: "calls:pay", add: 1 },
        ]);
        socket.reply(counted(sent?.id, true, [12, 4]));

        expect(await added).toEqual([12, 4]);
        expect([run.modelCalls, run.counters.get("calls:pay")]).toEqual([12, 4]);
    });

    it("adds this call to none of the totals when control refuses it", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const run = newRun();

        const added = addToRun(control, run, [
            { counter: "calls:pay", add: 1, max: 5 },
            { counter: "amount:pay:amount", add: 200, max: 1000 },
        ]);
        const [sent] = sentOf(socket, "run_count");
        socket.reply(counted(sent?.id, false, [1, 900]));

        expect(await added).toEqual([2, 1100]);
        expect([run.counters.get("calls:pay"), run.counters.get("amount:pay:amount")]).toEqual([1, 900]);
        expect(runCounts(await reconnect(fake))).toEqual([]);
    });

    it("counts here a call with more counts than one message takes", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const run = newRun();
        const adds = Array.from({ length: 21 }, (_, n) => ({ counter: `calls:t${n}`, add: 1, max: undefined }));

        expect(await addToRun(control, run, adds)).toEqual(adds.map(() => 1));

        expect(runCounts(socket)).toEqual([]);
        expect(runCounts(await reconnect(fake))).toEqual([]);
    });

    it("counts here when control's answer has the wrong number of totals", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const run = newRun();

        const added = addToRun(control, run, [{ counter: "steps", add: 1, max: 5 }]);
        const [sent] = sentOf(socket, "run_count");
        socket.reply(counted(sent?.id, true, [3, 4]));

        expect(await added).toEqual([1]);
        expect(run.modelCalls).toBe(1);
    });

    it("counts here while control is away, and sends the count without a cap once it is back", async () => {
        const { fake, control } = setup();
        const run = newRun();

        expect(await addToRun(control, run, [{ counter: "steps", add: 1, max: 1 }])).toEqual([1]);
        expect(await addToRun(control, run, [{ counter: "steps", add: 1, max: 1 }])).toEqual([2]);

        expect(runCounts(fake.connect())).toEqual([{ runId: run.runId, counter: "steps", add: 1, max: undefined }]);
    });

    it("keeps a counter whose name control can't take in this process", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const run = newRun();
        const counter = `calls:${"t".repeat(200)}`;

        expect(await addToRun(control, run, [{ counter, add: 1, max: undefined }])).toEqual([1]);

        expect(runCounts(socket)).toEqual([]);
        expect(runCounts(await reconnect(fake))).toEqual([]);
        expect(run.counters.get(counter)).toBe(1);
    });

    it("counts here when control is slow, and forgets the local count if control counted after all", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const run = newRun();

        const added = addToRun(control, run, [{ counter: "steps", add: 1, max: 5 }]);
        vi.advanceTimersByTime(5000);
        expect(await added).toEqual([1]);
        const [late] = sentOf(socket, "run_count");
        socket.reply(counted(late?.id, true, [3]));

        expect(run.modelCalls).toBe(3);
        expect(runCounts(await reconnect(fake))).toEqual([]);
    });

    it("keeps the local count when control's late answer is a refusal", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const run = newRun();

        const added = addToRun(control, run, [{ counter: "steps", add: 1, max: 5 }]);
        vi.advanceTimersByTime(5000);
        await added;
        const [late] = sentOf(socket, "run_count");
        socket.reply(counted(late?.id, false, [5]));

        expect(run.modelCalls).toBe(5);
        expect(runCounts(await reconnect(fake)).map((count) => count.add)).toEqual([1]);
    });

    it("keeps the local count when the link drops before control answers", async () => {
        const { fake, control } = setup();
        fake.connect();
        const run = newRun();

        const added = addToRun(control, run, [{ counter: "steps", add: 1, max: undefined }]);
        vi.advanceTimersByTime(5000);
        await added;

        expect(runCounts(await reconnect(fake)).map((count) => count.add)).toEqual([1]);
    });

    it("keeps nothing for later when it refuses a slow call itself", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const run = newRun();
        run.modelCalls = 5;

        const added = addToRun(control, run, [{ counter: "steps", add: 1, max: 5 }]);
        vi.advanceTimersByTime(5000);
        expect(await added).toEqual([6]);
        const [late] = sentOf(socket, "run_count");
        socket.reply(counted(late?.id, true, [6]));

        expect(run.modelCalls).toBe(6);
        expect(runCounts(await reconnect(fake))).toEqual([]);
    });
});

describe("readCost", () => {
    it("is the local total without control", async () => {
        const run = newRun();
        run.costUsd = 1.25;
        const { control } = setup();

        expect(await readCost(undefined, run)).toBe(1.25);
        expect(await readCost(control, run)).toBe(1.25);
    });

    it("asks control by adding nothing, and keeps the larger total", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const run = newRun();
        run.costUsd = 0.5;

        const higher = readCost(control, run);
        const [first] = sentOf(socket, "run_count");
        socket.reply(counted(first?.id, true, [4.5]));
        expect(await higher).toBe(4.5);

        const lower = readCost(control, run);
        const [, second] = sentOf(socket, "run_count");
        socket.reply(counted(second?.id, true, [1]));
        expect(await lower).toBe(4.5);

        expect(runCounts(socket)).toEqual([
            { runId: run.runId, counter: "cost", add: 0, max: undefined },
            { runId: run.runId, counter: "cost", add: 0, max: undefined },
        ]);
    });

    it("uses the local total when control is slow, and notes a late answer", async () => {
        const { fake, control } = setup();
        const socket = fake.connect();
        const run = newRun();
        run.costUsd = 0.5;

        const read = readCost(control, run);
        vi.advanceTimersByTime(5000);
        expect(await read).toBe(0.5);
        const [late] = sentOf(socket, "run_count");
        socket.reply(counted(late?.id, true, [6]));

        expect(run.costUsd).toBe(6);
    });
});
