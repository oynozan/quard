import { describe, expect, it } from "vitest";
import { mermaidConfig } from "./mermaid-config";
import { tokens } from "./tokens";

const values: unknown[] = Object.values(mermaidConfig.themeVariables);
const colors = values.filter((value): value is string => typeof value === "string" && value.startsWith("#"));

describe("mermaid config", () => {
    it("uses the base theme so the variables apply", () => {
        expect(mermaidConfig.theme).toBe("base");
        expect(mermaidConfig.themeVariables.darkMode).toBe(true);
        expect(mermaidConfig.startOnLoad).toBe(false);
    });

    it("inherits the page font", () => {
        expect(mermaidConfig.fontFamily).toBe("inherit");
        expect(mermaidConfig.themeVariables.fontFamily).toBe("inherit");
    });

    it("only uses Quard tokens and keeps Signal Green out", () => {
        const palette = new Set<string>(Object.values(tokens));
        for (const color of colors) expect(palette.has(color)).toBe(true);
        expect(colors).not.toContain(tokens.signal);
    });

    it("draws nodes as surfaces with a strong hairline", () => {
        expect(mermaidConfig.themeVariables.primaryColor).toBe(tokens.surface);
        expect(mermaidConfig.themeVariables.primaryBorderColor).toBe(tokens.lineStrong);
        expect(mermaidConfig.themeVariables.primaryTextColor).toBe(tokens.ink);
    });

    it("colors pie slices in the categorical order", () => {
        const { pie1, pie2, pie3, pie4, pie5 } = mermaidConfig.themeVariables;
        expect([pie1, pie2, pie3, pie4, pie5]).toEqual([
            tokens.cat1,
            tokens.cat2,
            tokens.cat3,
            tokens.cat4,
            tokens.cat5,
        ]);
    });
});
