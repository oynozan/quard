import { describe, expect, it } from "vitest";
import { codeTheme } from "./code-theme";
import { contrast } from "./contrast";
import { tokens } from "./tokens";

const background = codeTheme.colors["editor.background"];
const palette = new Set<string>(Object.values(tokens));
const ruleColors = codeTheme.settings.map((rule) => rule.settings.foreground);
const textColors = [
    ...ruleColors,
    ...Object.entries(codeTheme.colors)
        .filter(([key]) => key !== "editor.background")
        .map(([, color]) => color),
];

describe("code theme", () => {
    it("is a dark theme on the Recess well", () => {
        expect(codeTheme.type).toBe("dark");
        expect(background).toBe(tokens.recess);
    });

    it("only uses Quard tokens", () => {
        for (const color of [background, ...textColors]) expect(palette.has(color)).toBe(true);
    });

    it("keeps every text color readable on the well", () => {
        for (const color of textColors) expect(contrast(color, background)).toBeGreaterThanOrEqual(4.5);
    });

    it("never uses Signal Green for text", () => {
        expect(textColors).not.toContain(tokens.signal);
    });

    it("sets italics only on comments", () => {
        const styled = codeTheme.settings.filter((rule) => rule.settings.fontStyle);
        expect(styled).toEqual([expect.objectContaining({ scope: expect.arrayContaining(["comment"]) })]);
        expect(styled[0]?.settings.fontStyle).toBe("italic");
    });
});
