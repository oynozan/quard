// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CATEGORIES, formatCost, formatP, REPLAY_TONE, REPLAY_WORD, ROLE_WORD, sentenceCase } from "./labels";

describe("sentenceCase", () => {
    it("capitalizes only the first letter", () => {
        expect(sentenceCase("constraint dropped")).toBe("Constraint dropped");
    });

    it("leaves an empty string empty", () => {
        expect(sentenceCase("")).toBe("");
    });
});

describe("formatCost", () => {
    it("keeps 4 decimals for costs under 10 cents", () => {
        expect(formatCost(0.0123)).toBe("$0.0123");
        expect(formatCost(0)).toBe("$0.0000");
    });

    it("keeps 2 decimals from 10 cents up", () => {
        expect(formatCost(0.1)).toBe("$0.10");
        expect(formatCost(4.5)).toBe("$4.50");
    });
});

describe("formatP", () => {
    it("shows 4 decimals", () => {
        expect(formatP(0.0238)).toBe("0.0238");
        expect(formatP(0.0001)).toBe("0.0001");
    });

    it("caps tiny values at <0.0001", () => {
        expect(formatP(0.00004)).toBe("<0.0001");
    });
});

describe("word maps", () => {
    it("names every replay status and gives each a tone", () => {
        expect(REPLAY_WORD).toEqual({
            running: "Replaying",
            confirmed: "Confirmed",
            "not confirmed": "Not confirmed",
            "could not reproduce": "Could not reproduce",
        });
        expect(REPLAY_TONE).toEqual({
            running: "on",
            confirmed: "danger",
            "not confirmed": "context",
            "could not reproduce": "context",
        });
    });

    it("lists the five categories in menu order and names the path roles", () => {
        expect(CATEGORIES).toEqual(["bad input", "bad reasoning", "bad handoff", "broken tool", "missing guard"]);
        expect(ROLE_WORD).toEqual({
            entry: "Entry point",
            carry: "Handoff",
            turning: "Turning point",
            damage: "Damage",
        });
    });
});
