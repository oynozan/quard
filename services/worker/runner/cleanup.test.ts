import type { CleanupCounts, CleanupOptions, CleanupResult, Db } from "@quard/db";
import { afterEach, describe, expect, it, vi } from "vitest";

const cleanExpired = vi.hoisted(() => vi.fn<(db: Db, options: CleanupOptions) => Promise<CleanupResult>>());

vi.mock("@quard/db", () => ({ cleanExpired }));

const { CLEANUP_EVERY_MS, cleanupLine, startCleanup } = await import("./cleanup.ts");

const db = {} as Db;

const NONE: CleanupCounts = {
    runs: 0,
    approvals: 0,
    messageRecords: 0,
    runCounters: 0,
    dayCounters: 0,
    fleetUses: 0,
    fleetValues: 0,
    connections: 0,
    grants: 0,
};

const result = (deleted: Partial<CleanupCounts> = {}): CleanupResult => ({
    projects: 1,
    deleted: { ...NONE, ...deleted },
});

afterEach(() => {
    vi.useRealTimers();
    cleanExpired.mockReset();
});

describe("cleanupLine", () => {
    it("names each kind that lost rows", () => {
        expect(cleanupLine({ ...NONE, runs: 3, messageRecords: 12, grants: 1 })).toBe(
            "retention cleanup: deleted 3 runs, 12 message records, 1 revoked grants",
        );
    });

    it("says so when nothing expired", () => {
        expect(cleanupLine(NONE)).toBe("retention cleanup: nothing expired");
    });
});

describe("startCleanup", () => {
    it("cleans up at once, then every hour until stopped", async () => {
        vi.useFakeTimers();
        cleanExpired.mockResolvedValueOnce(result({ runs: 2 })).mockResolvedValue(result());
        const log = vi.fn();

        const loop = startCleanup({ db, log });
        await vi.advanceTimersByTimeAsync(0);
        expect(log).toHaveBeenCalledWith("retention cleanup: deleted 2 runs");

        await vi.advanceTimersByTimeAsync(CLEANUP_EVERY_MS - 1);
        expect(cleanExpired).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(cleanExpired).toHaveBeenCalledTimes(2);
        expect(log).toHaveBeenLastCalledWith("retention cleanup: nothing expired");

        await loop.stop();
        await vi.advanceTimersByTimeAsync(CLEANUP_EVERY_MS * 2);
        expect(cleanExpired).toHaveBeenCalledTimes(2);
    });

    it("logs a failed pass and tries again later", async () => {
        cleanExpired.mockRejectedValueOnce(new Error("database is down")).mockResolvedValue(result());
        const log = vi.fn();

        const loop = startCleanup({ db, log, everyMs: 5 });
        await vi.waitFor(() => expect(cleanExpired.mock.calls.length).toBeGreaterThan(1));
        await loop.stop();

        expect(log).toHaveBeenNthCalledWith(1, "retention cleanup failed: database is down");
    });

    it("asks the pass in flight to stop, and waits for it", async () => {
        let finish = () => {};
        cleanExpired.mockImplementation(
            (_db, options) =>
                new Promise((resolve) => {
                    finish = () => resolve(result({ runs: options.stopped?.() ? 0 : 1 }));
                }),
        );
        const log = vi.fn();
        const loop = startCleanup({ db, log, everyMs: 5 });

        const stopped = loop.stop();
        finish();
        await stopped;

        expect(cleanExpired).toHaveBeenCalledWith(db, { stopped: expect.any(Function) });
        expect(log.mock.calls).toEqual([["retention cleanup: nothing expired"]]);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(cleanExpired).toHaveBeenCalledTimes(1);
    });
});
