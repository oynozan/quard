import { hostname } from "node:os";
import type { Db, WorkerInfo } from "@quard/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BEAT_MS, startWorker } from "./worker.ts";

const runNextJob = vi.hoisted(() => vi.fn<() => Promise<string | undefined>>());
const beatWorker = vi.hoisted(() => vi.fn<(db: Db, worker: WorkerInfo) => Promise<void>>());

vi.mock("./jobs.ts", () => ({ runNextJob }));
vi.mock("@quard/db", () => ({ beatWorker }));

const deps = { db: {} as Db, openai: undefined };

beforeEach(() => {
    beatWorker.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    runNextJob.mockReset();
    beatWorker.mockReset();
});

describe("startWorker", () => {
    it("runs at most four jobs at once and logs a line for each", async () => {
        let started = 0;
        let running = 0;
        let most = 0;
        runNextJob.mockImplementation(async () => {
            started += 1;
            if (started > 6) {
                return undefined;
            }
            running += 1;
            most = Math.max(most, running);
            await new Promise((resolve) => setTimeout(resolve, 5));
            running -= 1;
            return `find inc_${started}: verdict: bad input`;
        });
        const log = vi.fn();

        const worker = startWorker({ ...deps, log, pollMs: 5 });
        await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(7));
        await worker.stop();

        expect(most).toBe(4);
        expect(log).toHaveBeenNthCalledWith(1, "worker started");
        expect(log).toHaveBeenCalledWith("find inc_6: verdict: bad input");
        expect(log).toHaveBeenLastCalledWith("worker stopped");
    });

    it("logs a failed claim and tries again after a pause", async () => {
        runNextJob.mockRejectedValueOnce(new Error("database is down")).mockResolvedValue(undefined);
        const log = vi.fn();

        const worker = startWorker({ ...deps, log, pollMs: 5 });
        await vi.waitFor(() => expect(runNextJob.mock.calls.length).toBeGreaterThan(4));
        await worker.stop();

        expect(log).toHaveBeenCalledWith("could not claim a job: database is down");
    });

    it("lets the jobs in flight finish when stopped", async () => {
        let finish = (_line: string) => {};
        runNextJob.mockReturnValueOnce(new Promise((resolve) => (finish = resolve))).mockResolvedValue(undefined);
        const log = vi.fn();
        const worker = startWorker({ ...deps, log, pollMs: 5 });

        const stopped = worker.stop();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(log).not.toHaveBeenCalledWith("worker stopped");

        finish("replay inc_1: confirmed");
        await stopped;
        expect(log.mock.calls.slice(-2)).toEqual([["replay inc_1: confirmed"], ["worker stopped"]]);
    });

    it("logs to the console and waits a second when no job is due", async () => {
        vi.useFakeTimers();
        runNextJob.mockResolvedValue(undefined);
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        const worker = startWorker(deps);
        await vi.advanceTimersByTimeAsync(999);
        expect(runNextJob).toHaveBeenCalledTimes(4);
        await vi.advanceTimersByTimeAsync(1);
        expect(runNextJob).toHaveBeenCalledTimes(8);

        const stopped = worker.stop();
        await vi.advanceTimersByTimeAsync(1000);
        await stopped;
        expect(log.mock.calls).toEqual([["worker started"], ["worker stopped"]]);
    });

    it("records that it runs at start and every 10 s, under a new id for each process, until stopped", async () => {
        vi.useFakeTimers();
        runNextJob.mockResolvedValue(undefined);
        vi.spyOn(console, "log").mockImplementation(() => {});

        const worker = startWorker(deps);
        expect(beatWorker).toHaveBeenCalledTimes(1);
        const [db, info] = beatWorker.mock.calls[0] ?? [];
        expect(db).toBe(deps.db);
        expect(info).toEqual({
            id: expect.stringMatching(/^[0-9a-f-]{36}$/),
            host: hostname(),
            pid: process.pid,
            startedAt: expect.any(Date),
        });

        await vi.advanceTimersByTimeAsync(BEAT_MS);
        expect(beatWorker).toHaveBeenCalledTimes(2);
        expect(beatWorker.mock.calls[1]?.[1]).toBe(info);

        const stopped = worker.stop();
        await vi.advanceTimersByTimeAsync(1000);
        await stopped;
        await vi.advanceTimersByTimeAsync(3 * BEAT_MS);
        expect(beatWorker).toHaveBeenCalledTimes(2);

        const other = startWorker(deps);
        expect(beatWorker.mock.calls[2]?.[1].id).not.toBe(info?.id);
        const otherStopped = other.stop();
        await vi.advanceTimersByTimeAsync(1000);
        await otherStopped;
    });

    it("logs a heartbeat that failed and keeps working", async () => {
        beatWorker.mockRejectedValueOnce(new Error("database is down"));
        runNextJob.mockResolvedValueOnce("find inc_1: verdict: bad input").mockResolvedValue(undefined);
        const log = vi.fn();

        const worker = startWorker({ ...deps, log, pollMs: 5 });
        await vi.waitFor(() => expect(log).toHaveBeenCalledWith("find inc_1: verdict: bad input"));
        await worker.stop();

        expect(log).toHaveBeenCalledWith("could not save the heartbeat: database is down");
        expect(log).toHaveBeenLastCalledWith("worker stopped");
    });

    it("waits for a heartbeat in flight before it stops", async () => {
        let finish = () => {};
        beatWorker.mockReturnValueOnce(new Promise((resolve) => (finish = () => resolve())));
        runNextJob.mockResolvedValue(undefined);
        const log = vi.fn();

        const stopped = startWorker({ ...deps, log, pollMs: 5 }).stop();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(log).not.toHaveBeenCalledWith("worker stopped");

        finish();
        await stopped;
        expect(log).toHaveBeenLastCalledWith("worker stopped");
    });
});
