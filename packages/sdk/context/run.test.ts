import { isRunId } from "@quard/shared";
import { describe, expect, it } from "vitest";
import { newRun } from "./run.ts";

describe("newRun", () => {
    it("creates a run with a fresh id, index and counters", () => {
        const run = newRun();

        expect(isRunId(run.runId)).toBe(true);
        expect(run.index.size).toBe(0);
        expect(run.counters.size).toBe(0);
    });

    it("can use a given id", () => {
        expect(newRun("4bf92f3577b34da6a3ce929d0e0e4736").runId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    });
});
