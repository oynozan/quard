// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatEdge, formatMark, formatRange, formatValue, monoWidth, sansWidth, share, unitWord } from "./format";

describe("formatValue", () => {
    it("prints whole numbers with separators by default", () => {
        expect(formatValue(1234.6)).toBe("1,235");
        expect(formatValue(42, "int")).toBe("42");
    });

    it("prints compact, dollar and percent values", () => {
        expect(formatValue(12345, "compact")).toBe("12.3K");
        expect(formatValue(1234.5, "usd")).toBe("$1,234.50");
        expect(formatValue(12.345, "percent")).toBe("12.3%");
    });

    it("drops a trailing zero from whole percents", () => {
        expect(formatValue(12, "percent")).toBe("12%");
    });
});

describe("unitWord", () => {
    it("uses the singular word only for exactly one", () => {
        expect(unitWord(1, "runs", "run")).toBe("run");
        expect(unitWord(2, "runs", "run")).toBe("runs");
        expect(unitWord(0, "runs", "run")).toBe("runs");
    });

    it("keeps the plural word when there is no singular", () => {
        expect(unitWord(1, "tokens")).toBe("tokens");
    });
});

describe("share", () => {
    it("prints a part of the total as a percent with one decimal", () => {
        expect(share(1, 3)).toBe("33.3%");
        expect(share(2, 4)).toBe("50%");
    });

    it("prints 0% when the total is zero or below", () => {
        expect(share(5, 0)).toBe("0%");
        expect(share(5, -1)).toBe("0%");
    });
});

describe("formatEdge", () => {
    it("prints milliseconds as seconds with up to two decimals", () => {
        expect(formatEdge(1234, "ms")).toBe("1.23 s");
        expect(formatEdge(1500, "ms")).toBe("1.5 s");
    });

    it("prints dollars and whole numbers", () => {
        expect(formatEdge(0.5, "usd")).toBe("$0.50");
        expect(formatEdge(12000, "int")).toBe("12,000");
    });
});

describe("formatRange", () => {
    it("prints a seconds range with one unit at the end", () => {
        expect(formatRange(1500, 2000, "ms")).toBe("1.50–2.00 s");
    });

    it("prints dollar and whole number ranges", () => {
        expect(formatRange(1, 2.5, "usd")).toBe("$1.00–$2.50");
        expect(formatRange(1000, 2000, "int")).toBe("1,000–2,000");
    });
});

describe("formatMark", () => {
    it("prints seconds with one fixed decimal", () => {
        expect(formatMark(2000, "ms")).toBe("2.0 s");
        expect(formatMark(1550, "ms")).toBe("1.6 s");
    });

    it("prints dollars and whole numbers", () => {
        expect(formatMark(3, "usd")).toBe("$3.00");
        expect(formatMark(4500, "int")).toBe("4,500");
    });
});

describe("text widths", () => {
    it("measures mono text at half an em per character, rounded up", () => {
        expect(monoWidth("abcd", 12)).toBe(24);
        expect(monoWidth("abc", 13)).toBe(20);
        expect(monoWidth("", 12)).toBe(0);
    });

    it("measures sans text a little wider than mono", () => {
        expect(sansWidth("abc", 12)).toBe(20);
        expect(sansWidth("abcd", 10)).toBe(22);
    });
});
