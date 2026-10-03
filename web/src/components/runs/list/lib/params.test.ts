// @vitest-environment node
import { describe, expect, it } from "vitest";
import { RUN_STATUSES, STATUS_WORD, isFiltered, parseRunsFilter, runsHref } from "./params";

describe("parseRunsFilter", () => {
    it("reads the search, agent and status from the link, trimmed", () => {
        expect(parseRunsFilter({ q: "  pay ", agent: " billing ", status: "failed" })).toEqual({
            q: "pay",
            agent: "billing",
            status: "failed",
        });
    });

    it("takes the first value when a parameter repeats", () => {
        expect(parseRunsFilter({ q: ["one", "two"], agent: ["billing"], status: ["blocked", "failed"] })).toEqual({
            q: "one",
            agent: "billing",
            status: "blocked",
        });
    });

    it("leaves missing parts empty and drops an unknown status", () => {
        expect(parseRunsFilter({})).toEqual({ q: "", agent: "", status: "" });
        expect(parseRunsFilter({ status: "exploded" }).status).toBe("");
        expect(parseRunsFilter({ q: [] }).q).toBe("");
    });

    it("cuts a long search to 200 characters", () => {
        expect(parseRunsFilter({ q: "x".repeat(250) }).q).toHaveLength(200);
    });
});

describe("runsHref", () => {
    it("links to the plain runs page when nothing is filtered", () => {
        expect(runsHref({ q: "", agent: "", status: "" })).toBe("/runs");
    });

    it("carries each filter that is set, encoded", () => {
        expect(runsHref({ q: "pay invoice", agent: "billing", status: "waiting" })).toBe(
            "/runs?q=pay+invoice&agent=billing&status=waiting",
        );
        expect(runsHref({ q: "", agent: "a&b", status: "" })).toBe("/runs?agent=a%26b");
    });

    it("reads back the same filter it writes", () => {
        const filter = { q: "iban", agent: "researcher", status: "running" as const };
        const params = Object.fromEntries(new URL(runsHref(filter), "http://x").searchParams);
        expect(parseRunsFilter(params)).toEqual(filter);
    });
});

describe("isFiltered", () => {
    it("is true when any filter is set", () => {
        expect(isFiltered({ q: "", agent: "", status: "" })).toBe(false);
        expect(isFiltered({ q: "x", agent: "", status: "" })).toBe(true);
        expect(isFiltered({ q: "", agent: "billing", status: "" })).toBe(true);
        expect(isFiltered({ q: "", agent: "", status: "failed" })).toBe(true);
    });
});

describe("status words", () => {
    it("has a word for every status the filter accepts", () => {
        expect(RUN_STATUSES.map((status) => STATUS_WORD[status])).toEqual([
            "Running",
            "Waiting",
            "Completed",
            "Failed",
            "Blocked",
        ]);
    });
});
