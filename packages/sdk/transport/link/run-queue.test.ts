import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newRun } from "../../context/run.ts";
import { fakeLink, sentOf } from "../../test/fake-socket.ts";
import { createRequests } from "./requests.ts";
import { createRunReplays } from "./run-queue.ts";

function setup() {
    const { fake, link } = fakeLink();
    const requests = createRequests(link);
    return { fake, link, replays: createRunReplays(link, requests, 5000) };
}

const counts = (sent: Array<{ runId: string; counter: string; add: number; max?: number }>) =>
    sent.map(({ runId, counter, add, max }) => ({ runId, counter, add, max }));

// Lets the replies' promise callbacks run
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("run count replays", () => {
    it("sends a count at once while control is there, without a cap, and notes control's total", async () => {
        const { fake, replays } = setup();
        const socket = fake.connect();
        const run = newRun();

        replays.send({ run, counter: "cost", add: 0.5 });

        const [sent] = sentOf(socket, "run_count");
        expect(counts(sentOf(socket, "run_count"))).toEqual([
            { runId: run.runId, counter: "cost", add: 0.5, max: undefined },
        ]);
        expect(socket.held).toBe(false);
        socket.reply({ type: "counted", id: sent?.id as string, ok: true, used: 2.5 });
        await settle();

        expect(run.costUsd).toBe(2.5);
        socket.drop();
        vi.advanceTimersByTime(1000);
        expect(sentOf(fake.connect(), "run_count")).toEqual([]);
    });

    it("adds up counts made while control was away and sends them once it is back", () => {
        const { fake, replays } = setup();
        const run = newRun();
        const other = newRun();
        replays.send({ run, counter: "steps", add: 1 });
        replays.keep({ run, counter: "steps", add: 2 });
        replays.keep({ run, counter: "calls:pay", add: 1 });
        replays.keep({ run: other, counter: "steps", add: 4 });

        const socket = fake.connect();

        expect(counts(sentOf(socket, "run_count"))).toEqual([
            { runId: run.runId, counter: "steps", add: 3, max: undefined },
            { runId: run.runId, counter: "calls:pay", add: 1, max: undefined },
            { runId: other.runId, counter: "steps", add: 4, max: undefined },
        ]);
    });

    it("takes back counts control turned out to have", () => {
        const { fake, replays } = setup();
        const run = newRun();
        const other = newRun();
        replays.keep({ run, counter: "steps", add: 2 });
        replays.keep({ run, counter: "steps", add: 2 });
        replays.keep({ run, counter: "cost", add: 1 });
        replays.drop({ run, counter: "steps", add: 2 });
        replays.drop({ run, counter: "cost", add: 1 });
        replays.drop({ run, counter: "calls:pay", add: 1 });
        replays.drop({ run: other, counter: "steps", add: 1 });
        replays.keep({ run: other, counter: "steps", add: 1 });
        replays.drop({ run: other, counter: "steps", add: 5 });

        const socket = fake.connect();

        expect(counts(sentOf(socket, "run_count"))).toEqual([
            { runId: run.runId, counter: "steps", add: 2, max: undefined },
        ]);
    });

    it("keeps a count control did not answer, for the next reconnect", async () => {
        const { fake, replays } = setup();
        const run = newRun();
        const socket = fake.connect();
        replays.send({ run, counter: "steps", add: 1 });
        socket.drop();
        await settle();

        vi.advanceTimersByTime(1000);
        const again = fake.connect();

        expect(counts(sentOf(again, "run_count")).map((count) => count.add)).toEqual([1]);
    });

    it("forgets a count control answers late, and notes its total", async () => {
        const { fake, replays } = setup();
        const run = newRun();
        replays.keep({ run, counter: "steps", add: 1 });
        const socket = fake.connect();
        const [sent] = sentOf(socket, "run_count");

        vi.advanceTimersByTime(5000);
        await settle();
        socket.reply({ type: "counted", id: sent?.id as string, ok: true, used: 9 });
        vi.advanceTimersByTime(30_000);
        socket.drop();
        vi.advanceTimersByTime(1000);

        expect(sentOf(socket, "run_count")).toHaveLength(1);
        expect(sentOf(fake.connect(), "run_count")).toEqual([]);
        expect(run.modelCalls).toBe(9);
    });

    it("sends a slow count again when the link drops before control answers", async () => {
        const { fake, replays } = setup();
        replays.keep({ run: newRun(), counter: "steps", add: 1 });
        const socket = fake.connect();

        vi.advanceTimersByTime(5000);
        await settle();
        socket.drop();
        vi.advanceTimersByTime(1000);

        expect(sentOf(fake.connect(), "run_count")).toHaveLength(1);
    });

    it("sends what is left again while the link stays up", async () => {
        const { fake, replays } = setup();
        const socket = fake.connect();
        replays.send({ run: newRun(), counter: "steps", add: 1 });
        vi.advanceTimersByTime(5000);
        await settle();

        vi.advanceTimersByTime(30_000);

        expect(sentOf(socket, "run_count")).toHaveLength(2);
    });

    it("waits for the link when it drops before the next try", () => {
        const { fake, replays } = setup();
        const socket = fake.connect();
        replays.keep({ run: newRun(), counter: "steps", add: 1 });

        socket.drop();
        vi.advanceTimersByTime(30_000);
        const again = fake.connect();

        expect(sentOf(socket, "run_count")).toEqual([]);
        expect(sentOf(again, "run_count")).toHaveLength(1);
    });

    it("keeps the counts of at most 1000 runs, dropping the oldest first", () => {
        const { fake, replays } = setup();
        const runs = Array.from({ length: 1001 }, () => newRun());
        runs.forEach((run) => replays.keep({ run, counter: "steps", add: 1 }));

        const sent = sentOf(fake.connect(), "run_count");

        expect(sent).toHaveLength(1000);
        expect(sent[0]?.runId).toBe(runs[1]?.runId);
    });
});
