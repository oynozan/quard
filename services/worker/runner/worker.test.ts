import { afterEach, describe, expect, it, vi } from "vitest";
import { startWorker } from "./worker.ts";

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("startWorker", () => {
    it("logs start and stop and clears its timer", () => {
        vi.useFakeTimers();
        const log = vi.fn();

        const worker = startWorker(log);
        vi.advanceTimersByTime(60_000);
        worker.stop();

        expect(log.mock.calls).toEqual([["worker started"], ["worker stopped"]]);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("logs to the console by default", () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        startWorker().stop();

        expect(log).toHaveBeenCalledWith("worker started");
    });
});
