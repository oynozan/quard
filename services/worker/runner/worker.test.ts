import type { Db } from "@quard/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startWorker } from "./worker.ts";

const runNextJob = vi.hoisted(() => vi.fn<() => Promise<string | undefined>>());

vi.mock("./jobs.ts", () => ({ runNextJob }));

const deps = { db: {} as Db, openai: undefined };

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    runNextJob.mockReset();
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
});
