// @vitest-environment node
import { describe, expect, it } from "vitest";
import { edgeWidth, SHARE_STYLES, shareStyle } from "./tones";

describe("shareStyle", () => {
    it("calls a link trusted below a tenth untrusted", () => {
        expect(shareStyle(0).tone).toBe("trusted");
        expect(shareStyle(0.099).tone).toBe("trusted");
    });

    it("calls a link mixed from a tenth up to just under 60%", () => {
        expect(shareStyle(0.1)).toEqual({ tone: "mixed", word: "10–59%", color: "var(--cat-3)", dash: null });
        expect(shareStyle(0.59).tone).toBe("mixed");
    });

    it("calls a link untrusted from 60% and dashes it", () => {
        expect(shareStyle(0.6)).toBe(SHARE_STYLES[2]);
        expect(shareStyle(1).dash).toBe("4 2");
    });
});

describe("edgeWidth", () => {
    it("thickens the line as the message count crosses each step", () => {
        expect([0, 99, 100, 999, 1000, 4999, 5000, 80000].map(edgeWidth)).toEqual([1, 1, 1.5, 1.5, 2, 2, 3, 3]);
    });
});
