import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { every } from "./every.ts";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("every", () => {
    it("runs the task after each wait, one run at a time, until stopped", async () => {
        let release = () => {};
        const task = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
        const stop = every(100, "the check", task, vi.fn());

        await vi.advanceTimersByTimeAsync(99);
        expect(task).toHaveBeenCalledTimes(0);
        await vi.advanceTimersByTimeAsync(1);
        expect(task).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(500);
        expect(task).toHaveBeenCalledTimes(1);
        release();
        await vi.advanceTimersByTimeAsync(100);
        expect(task).toHaveBeenCalledTimes(2);

        stop();
        release();
        await vi.advanceTimersByTimeAsync(1_000);
        expect(task).toHaveBeenCalledTimes(2);
    });

    it("logs a failed run and runs again", async () => {
        const log = vi.fn();
        const task = vi.fn().mockRejectedValueOnce(new Error("database down")).mockResolvedValue(undefined);
        const stop = every(10, "the check", task, log);

        await vi.advanceTimersByTimeAsync(20);

        expect(log).toHaveBeenCalledWith("control: the check failed: database down");
        expect(task).toHaveBeenCalledTimes(2);
        stop();
    });
});
