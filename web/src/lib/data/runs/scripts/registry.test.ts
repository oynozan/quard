// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isRunId, MINUTE, NOW } from "../../rng";
import { buildPinned, marked } from "../../../../../test/data-scripts-paths/build";
import { REFUND_REPEAT_RUN_ID, REFUND_RUN_ID } from "./approval-runs";
import { delegationLoop } from "./incident-runs";
import { LOOP_RUN_ID, PINNED_RUNS, pinnedRun, STRIPPED_RUN_ID } from "./registry";
import { STORY_RUN_ID, STORY_STARTED_AT, supplierStory } from "./story";

describe("PINNED_RUNS", () => {
    it("uses distinct 32-hex run ids", () => {
        const ids = PINNED_RUNS.map((run) => run.id);
        expect(ids.every((id) => isRunId(id))).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("starts every run in the past", () => {
        expect(PINNED_RUNS.every((run) => run.startedAt < NOW)).toBe(true);
    });

    it("links each incident from inc_105 to inc_118 to exactly one run", () => {
        const incidents = PINNED_RUNS.flatMap((run) => (run.incidentId ? [run.incidentId] : []));
        const expected = Array.from({ length: 14 }, (_, index) => `inc_${105 + index}`);
        expect([...incidents].sort()).toEqual(expected);
    });

    it("leaves the decision log's runs without links", () => {
        for (const id of [STRIPPED_RUN_ID, LOOP_RUN_ID]) {
            expect(pinnedRun(id)).toMatchObject({ incidentId: null, approvalId: null });
        }
    });

    it("links both refund runs to the same approval request", () => {
        expect(pinnedRun(REFUND_RUN_ID)?.approvalId).toBe("apr_7f2c");
        expect(pinnedRun(REFUND_REPEAT_RUN_ID)?.approvalId).toBe("apr_7f2c");
    });

    it("pins the PROJECT.md story with its incident and approval", () => {
        expect(pinnedRun(STORY_RUN_ID)).toEqual({
            id: STORY_RUN_ID,
            startedAt: STORY_STARTED_AT,
            write: supplierStory,
            incidentId: "inc_118",
            approvalId: "apr_7f31",
        });
    });
});

describe("the pinned runs, once built", () => {
    it("mark an entry, a turning point and damage in every incident run", () => {
        for (const pinned of PINNED_RUNS.filter((run) => run.incidentId)) {
            const run = buildPinned(pinned.id);
            for (const role of ["entry", "turning", "damage"] as const) expect(marked(run, role)).toBeTruthy();
        }
    });

    it("ask for approval under the request id each run links to", () => {
        for (const pinned of PINNED_RUNS.filter((run) => run.approvalId)) {
            const run = buildPinned(pinned.id);
            const asks = run.detail.steps.filter((step) => step.kind === "approval");
            expect(asks.map((step) => step.approval?.requestId)).toContain(pinned.approvalId);
        }
    });

    it("happen between their pinned start and now", () => {
        for (const pinned of PINNED_RUNS) {
            const times = buildPinned(pinned.id).detail.steps.map((step) => step.startedAt);
            expect(Math.min(...times)).toBeGreaterThanOrEqual(pinned.startedAt);
            expect(Math.max(...times)).toBeLessThanOrEqual(NOW);
        }
    });
});

describe("pinnedRun", () => {
    it("finds a pinned run by id", () => {
        expect(pinnedRun(LOOP_RUN_ID)).toMatchObject({ startedAt: NOW - 7 * MINUTE - 12_000, write: delegationLoop });
    });

    it("returns undefined for a generated run's id", () => {
        expect(pinnedRun("0".repeat(32))).toBeUndefined();
    });
});
