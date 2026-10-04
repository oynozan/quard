// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NOW, SECOND } from "../../../../../test/time";
import { workerRunning } from "./worker";

const ago = (ms: number) => new Date(NOW - ms);

describe("workerRunning", () => {
    it("counts a worker seen in the last 30 seconds as running", () => {
        expect(workerRunning(ago(0), NOW)).toBe(true);
        expect(workerRunning(ago(30 * SECOND), NOW)).toBe(true);
        // A database clock a little ahead of this server's still counts
        expect(workerRunning(ago(-2 * SECOND), NOW)).toBe(true);
    });

    it("counts a worker that stopped checking in, or never did, as not running", () => {
        expect(workerRunning(ago(30 * SECOND + 1), NOW)).toBe(false);
        expect(workerRunning(null, NOW)).toBe(false);
    });
});
