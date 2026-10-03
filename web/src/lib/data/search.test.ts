// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SEARCH_EXAMPLES, searchRuns } from "./search";

// These run against the real seeded mock runs, as the search page does.
describe("SEARCH_EXAMPLES", () => {
    it("leaves sensitive values out", () => {
        expect(SEARCH_EXAMPLES.some((example) => ["iban", "email", "card"].includes(example.kind))).toBe(false);
    });

    it.each(SEARCH_EXAMPLES)("finds runs for $query as a $kind", async ({ query, kind }) => {
        const result = await searchRuns(query);
        expect(result.kind).toBe(kind);
        expect(result.byHash).toBe(false);
        expect(result.shown).toBe(query);
        expect(result.runs).toBeGreaterThan(0);
        const times = result.matches.map((match) => match.at);
        expect(times).toEqual([...times].sort((a, b) => b - a));
    });
});
