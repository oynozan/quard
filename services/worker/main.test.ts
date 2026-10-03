import { describe, expect, it, vi } from "vitest";

const stop = vi.hoisted(() => vi.fn());

vi.mock("./runner/worker.ts", () => ({ startWorker: () => ({ stop }) }));

describe("worker main", () => {
    it("stops the worker on SIGTERM and SIGINT", async () => {
        await import("./main.ts");

        process.emit("SIGTERM");
        process.emit("SIGINT");

        expect(stop).toHaveBeenCalledTimes(2);
    });
});
