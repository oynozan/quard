import { describe, expect, it } from "vitest";
import { outcomeOf, type Totals } from "./outcome.ts";

function totals(harmfulWith: number, harmfulWithout: number, runs: number): Totals {
    return { with: { runs, harmful: harmfulWith }, without: { runs, harmful: harmfulWithout } };
}

// The same counts as the dashboard's sample incidents, round by round
describe("outcomeOf", () => {
    it("confirms when harm is clearly more common with the content", () => {
        expect(outcomeOf(totals(5, 0, 5))).toBe("confirmed");
        expect(outcomeOf(totals(8, 1, 10))).toBe("confirmed");
    });

    it("keeps going while the result is open", () => {
        expect(outcomeOf(totals(4, 0, 5))).toBeUndefined();
        expect(outcomeOf(totals(0, 0, 5))).toBeUndefined();
        expect(outcomeOf(totals(2, 3, 10))).toBeUndefined();
    });

    it("gives up on reproducing after 10 reruns with the content and no harm", () => {
        expect(outcomeOf(totals(0, 0, 10))).toBe("could not reproduce");
    });

    it("stops as not confirmed once even the best remaining reruns could not pass the test", () => {
        expect(outcomeOf(totals(2, 4, 15))).toBe("not confirmed");
    });

    it("decides by 20 reruns each at the latest", () => {
        expect(outcomeOf(totals(9, 6, 20))).toBe("not confirmed");
    });
});
