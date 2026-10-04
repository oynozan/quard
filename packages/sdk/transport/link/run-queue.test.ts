import type { RunCountMessage } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newRun } from "../../context/run.ts";
import { fakeLink, sentOf } from "../../test/fake-socket.ts";
import { createRequests } from "./requests.ts";
import { createRunReplays, runCounted } from "./run-queue.ts";

function setup() {
    const { fake, link } = fakeLink();
    const requests = createRequests(link);
    return { fake, link, replays: createRunReplays(link, requests, 5000) };
}

const counts = (sent: RunCountMessage[]) => sent.map(({ runId, counts }) => ({ runId, counts }));

// Lets the replies' promise callbacks run
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("run count replays", () => {
    it("sends a run's counts at once in one message, without a cap, and notes control's totals", async () => {
        const { fake, replays } = setup();
        const socket = fake.connect();
        const run = newRun();

        replays.send(run, [
            { counter: "cost", add: 0.5 },
            { counter: "steps", add: 2 },
        ]);

        const [sent] = sentOf(socket, "run_count");
        expect(counts(sentOf(socket, "run_count"))).toEqual([
            {
                runId: run.runId,
                counts: [
                    { counter: "cost", add: 0.5 },
                    { counter: "steps", add: 2 },
                ],
            },
        ]);
        expect(socket.held).toBe(false);
        socket.reply({ type: "run_counted", id: sent?.id as string, ok: true, used: [2.5, 7] });
        await settle();

        expect([run.costUsd, run.modelCalls]).toEqual([2.5, 7]);
        socket.drop();
        vi.advanceTimersByTime(1000);
        expect(sentOf(fake.connect(), "run_count")).toEqual([]);
    });

    it("adds up counts made while control was away and sends each run's once it is back", () => {
        const { fake, replays } = setup();
        const run = newRun();
        const other = newRun();
        replays.send(run, [{ counter: "steps", add: 1 }]);
        replays.keep(run, [
            { counter: "steps", add: 2 },
            { counter: "calls:pay", add: 1 },
        ]);
        replays.keep(other, [{ counter: "steps", add: 4 }]);

        const socket = fake.connect();

        expect(counts(sentOf(socket, "run_count"))).toEqual([
            {
                runId: run.runId,
                counts: [
                    { counter: "steps", add: 3 },
                    { counter: "calls:pay", add: 1 },
                ],
            },
            { runId: other.runId, counts: [{ counter: "steps", add: 4 }] },
        ]);
    });

    it("sends at most 20 counts in one message", () => {
        const { fake, replays } = setup();
        const run = newRun();
        replays.keep(
            run,
            Array.from({ length: 21 }, (_, n) => ({ counter: `calls:tool${n}`, add: 1 })),
        );

        const sent = sentOf(fake.connect(), "run_count");

        expect(sent.map((message) => message.counts.length)).toEqual([20, 1]);
    });

    it("takes back counts control turned out to have", () => {
        const { fake, replays } = setup();
        const run = newRun();
        const other = newRun();
        replays.keep(run, [{ counter: "steps", add: 2 }]);
        replays.keep(run, [
            { counter: "steps", add: 2 },
            { counter: "cost", add: 1 },
        ]);
        replays.drop(run, [
            { counter: "steps", add: 2 },
            { counter: "cost", add: 1 },
            { counter: "calls:pay", add: 1 },
        ]);
        replays.drop(other, [{ counter: "steps", add: 1 }]);
        replays.keep(other, [{ counter: "steps", add: 1 }]);
        replays.drop(other, [{ counter: "steps", add: 5 }]);

        const socket = fake.connect();

        expect(counts(sentOf(socket, "run_count"))).toEqual([
            { runId: run.runId, counts: [{ counter: "steps", add: 2 }] },
        ]);
    });

    it("keeps counts control did not answer, for the next reconnect", async () => {
        const { fake, replays } = setup();
        const run = newRun();
        const socket = fake.connect();
        replays.send(run, [{ counter: "steps", add: 1 }]);
        socket.drop();
        await settle();

        vi.advanceTimersByTime(1000);
        const again = fake.connect();

        expect(counts(sentOf(again, "run_count"))).toEqual([
            { runId: run.runId, counts: [{ counter: "steps", add: 1 }] },
        ]);
    });

    it("keeps counts whose answer has the wrong number of totals", async () => {
        const { fake, replays } = setup();
        const run = newRun();
        const socket = fake.connect();
        replays.send(run, [{ counter: "steps", add: 1 }]);
        const [sent] = sentOf(socket, "run_count");
        socket.reply({ type: "run_counted", id: sent?.id as string, ok: true, used: [] });
        await settle();

        vi.advanceTimersByTime(30_000);

        expect(sentOf(socket, "run_count")).toHaveLength(2);
        expect(run.modelCalls).toBe(0);
    });

    it("forgets counts control answers late, and notes their totals", async () => {
        const { fake, replays } = setup();
        const run = newRun();
        replays.keep(run, [{ counter: "steps", add: 1 }]);
        const socket = fake.connect();
        const [sent] = sentOf(socket, "run_count");

        vi.advanceTimersByTime(5000);
        await settle();
        socket.reply({ type: "run_counted", id: sent?.id as string, ok: true, used: [9] });
        vi.advanceTimersByTime(30_000);
        socket.drop();
        vi.advanceTimersByTime(1000);

        expect(sentOf(socket, "run_count")).toHaveLength(1);
        expect(sentOf(fake.connect(), "run_count")).toEqual([]);
        expect(run.modelCalls).toBe(9);
    });

    it("sends slow counts again when the link drops before control answers", async () => {
        const { fake, replays } = setup();
        replays.keep(newRun(), [{ counter: "steps", add: 1 }]);
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
        replays.send(newRun(), [{ counter: "steps", add: 1 }]);
        vi.advanceTimersByTime(5000);
        await settle();

        vi.advanceTimersByTime(30_000);

        expect(sentOf(socket, "run_count")).toHaveLength(2);
    });

    it("waits for the link when it drops before the next try", () => {
        const { fake, replays } = setup();
        const socket = fake.connect();
        replays.keep(newRun(), [{ counter: "steps", add: 1 }]);

        socket.drop();
        vi.advanceTimersByTime(30_000);
        const again = fake.connect();

        expect(sentOf(socket, "run_count")).toEqual([]);
        expect(sentOf(again, "run_count")).toHaveLength(1);
    });

    it("keeps the counts of at most 1000 runs, dropping the oldest first", () => {
        const { fake, replays } = setup();
        const runs = Array.from({ length: 1001 }, () => newRun());
        runs.forEach((run) => replays.keep(run, [{ counter: "steps", add: 1 }]));

        const sent = sentOf(fake.connect(), "run_count");

        expect(sent).toHaveLength(1000);
        expect(sent[0]?.runId).toBe(runs[1]?.runId);
    });
});

describe("runCounted", () => {
    it("is control's answer with one total per count, or undefined", () => {
        const answer = { type: "run_counted" as const, id: "1".repeat(16), ok: true, used: [1, 2] };

        expect(runCounted(answer, 2)).toBe(answer);
        expect(runCounted(answer, 1)).toBeUndefined();
        expect(runCounted(undefined, 2)).toBeUndefined();
        expect(runCounted({ type: "labels", id: "1".repeat(16), records: [] }, 0)).toBeUndefined();
    });
});
