import { describe, expect, it } from "vitest";
import { BACKGROUND, SIGNAL } from "./site";
import { tokens } from "./tokens";

// Standard HSL to hex conversion, to check the primary color
function hslToHex(h: number, s: number, l: number) {
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const channel = (n: number) => {
        const k = (n + h / 30) % 12;
        const value = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(value * 255)
            .toString(16)
            .padStart(2, "0");
    };
    return `#${channel(0)}${channel(8)}${channel(4)}`;
}

describe("site colors", () => {
    it("makes Signal Green the primary color", () => {
        expect(hslToHex(SIGNAL.hue, SIGNAL.saturation, SIGNAL.lightness)).toBe(tokens.signal);
    });

    it("uses the page color for both theme slots", () => {
        expect(BACKGROUND).toEqual({ dark: "#161616", light: "#161616" });
    });
});
