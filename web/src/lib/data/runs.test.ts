// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// The Postgres-backed reads are a boundary; this file only passes them through.
const query = vi.hoisted(() => ({ listRuns: vi.fn(), getRun: vi.fn() }));
vi.mock("./runs/query", () => query);

const runs = await import("./runs");
const { catalogRows } = await import("./runs/catalog");
const story = await import("./runs/scripts/story");

describe("recentRuns", () => {
    it("gives the 60 newest catalog runs, newest first", () => {
        const recent = runs.recentRuns();
        expect(recent).toHaveLength(60);
        expect(recent).toEqual(catalogRows().slice(0, 60));
        const starts = recent.map((run) => run.startedAt);
        expect(starts).toEqual([...starts].sort((a, b) => b - a));
    });
});

describe("runs module", () => {
    it("reads runs from the database query module", () => {
        expect(runs.listRuns).toBe(query.listRuns);
        expect(runs.getRun).toBe(query.getRun);
    });

    it("shares the story run id", () => {
        expect(runs.STORY_RUN_ID).toBe(story.STORY_RUN_ID);
    });
});
