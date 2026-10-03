// @vitest-environment node
import { describe, expect, it } from "vitest";
import { untrustedLinksOf } from "./links";

const link = (from: string, to: string, delegations: number, untrusted: number) => ({
    from,
    to,
    delegations,
    untrusted,
    runs: 1,
    lastAt: new Date(0),
});

describe("untrustedLinksOf", () => {
    it("keeps the links that carried untrusted content, the largest share first", () => {
        const links = untrustedLinksOf([
            link("planner", "researcher", 8, 2),
            link("support", "billing", 5, 0),
            link("researcher", "billing", 2, 2),
        ]);

        expect(links).toEqual([
            { from: "researcher", to: "billing", delegations: 2, untrusted: 2, untrustedShare: 1 },
            { from: "planner", to: "researcher", delegations: 8, untrusted: 2, untrustedShare: 0.25 },
        ]);
    });

    it("keeps the query's order for equal shares", () => {
        const links = untrustedLinksOf([link("planner", "billing", 4, 2), link("support", "billing", 2, 1)]);

        expect(links.map((row) => row.from)).toEqual(["planner", "support"]);
    });

    it("is empty when no link carried untrusted content", () => {
        expect(untrustedLinksOf([link("support", "billing", 5, 0)])).toEqual([]);
        expect(untrustedLinksOf([])).toEqual([]);
    });
});
