// @vitest-environment node
import { describe, expect, it } from "vitest";
import { matchOf } from "../../../../test/incidents-search/search";
import { KIND_WORD, matchWord, plural, stepName } from "./words";

describe("KIND_WORD", () => {
    it("names each kind of query", () => {
        expect(KIND_WORD.iban).toBe("IBAN");
        expect(KIND_WORD.path).toBe("File path");
        expect(Object.keys(KIND_WORD)).toHaveLength(11);
    });
});

describe("matchWord", () => {
    it("says how a value matched", () => {
        expect(matchWord(matchOf({ match: "exact" }))).toBe("exact");
        expect(matchWord(matchOf({ match: "inside" }))).toBe("inside a value");
        expect(matchWord(matchOf({ match: "host" }))).toBe("same host");
        expect(matchWord(matchOf({ match: "domain" }))).toBe("same domain");
        expect(matchWord(matchOf({ match: "name" }))).toBe("by name");
        expect(matchWord(matchOf({ match: "text" }))).toBe("contains");
    });
});

describe("stepName", () => {
    it("names the step by its tool", () => {
        expect(stepName(matchOf({ tool: "pay_invoice" }))).toBe("pay_invoice");
    });

    it("names an agent's start when there is no tool", () => {
        expect(stepName(matchOf({ tool: "", field: "agent" }))).toBe("Agent started");
    });

    it("falls back to Step", () => {
        expect(stepName(matchOf({ tool: "", field: "message" }))).toBe("Step");
    });
});

describe("plural", () => {
    it("picks the single word only for one", () => {
        expect(plural(1, "match", "matches")).toBe("match");
        expect(plural(0, "match", "matches")).toBe("matches");
        expect(plural(2, "run", "runs")).toBe("runs");
    });
});
