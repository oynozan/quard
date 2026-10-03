// @vitest-environment node
import { describe, expect, it } from "vitest";
import { matchOf, RUN_A, RUN_B, runOf } from "../../../../test/incidents-search/search";
import { groupByRun, readQuery, searchHref } from "./group";

describe("groupByRun", () => {
    it("groups matches by run in the order they come", () => {
        const first = matchOf({ runId: RUN_B, stepId: "s9" });
        const second = matchOf({ runId: RUN_A, stepId: "s3" });
        const third = matchOf({ runId: RUN_B, stepId: "s2" });
        const run = runOf({ id: RUN_B });
        const groups = groupByRun([first, second, third], [run]);
        expect(groups).toEqual([
            { runId: RUN_B, run, matches: [first, third] },
            { runId: RUN_A, run: null, matches: [second] },
        ]);
    });

    it("returns no groups for no matches", () => {
        expect(groupByRun([], [runOf()])).toEqual([]);
    });
});

describe("searchHref", () => {
    it("puts the trimmed, encoded query in the address", () => {
        expect(searchHref("  a b&c ")).toBe("/search?q=a%20b%26c");
    });

    it("clears the query when it is only spaces", () => {
        expect(searchHref("   ")).toBe("/search");
    });
});

describe("readQuery", () => {
    it("reads and trims ?q=", () => {
        expect(readQuery({ q: "  claims-desk.io " })).toBe("claims-desk.io");
    });

    it("uses only the first of repeated values", () => {
        expect(readQuery({ q: ["first", "second"] })).toBe("first");
    });

    it("reads a missing query as empty", () => {
        expect(readQuery({})).toBe("");
        expect(readQuery({ q: [] })).toBe("");
    });

    it("cuts a long query to 300 characters", () => {
        expect(readQuery({ q: "x".repeat(400) })).toHaveLength(300);
    });
});
