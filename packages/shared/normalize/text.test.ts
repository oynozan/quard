import { describe, expect, it } from "vitest";
import { cleanText, hasInvisible, plainSpaces } from "./text.ts";

describe("cleanText", () => {
    it("removes zero-width and tag characters", () => {
        expect(cleanText("DE89\u200B3704\u{E0041}")).toBe("DE893704");
    });

    it("folds full-width letters to plain ones", () => {
        expect(cleanText("\uFF21\uFF22")).toBe("AB");
    });
});

describe("soft hyphens and other hidden marks", () => {
    it("removes them too", () => {
        const soft = String.fromCodePoint(0xad);
        const filler = String.fromCodePoint(0x3164);

        expect(cleanText(`ig${soft}nore x@ev${soft}il.com${filler}`)).toBe("ignore x@evil.com");
        expect(hasInvisible(`in${soft}structions`)).toBe(true);
    });
});

describe("plainSpaces", () => {
    it("removes hidden characters and turns look-alike spaces into plain ones", () => {
        expect(plainSpaces("DE89 3704 0044　x​y")).toBe("DE89 3704 0044 xy");
    });

    it("leaves other characters alone, so masks stay as they are", () => {
        expect(plainSpaces("DE89…3000 Ａ")).toBe("DE89…3000 Ａ");
    });
});

describe("hasInvisible", () => {
    it("spots hidden characters", () => {
        expect(hasInvisible("a\u2060b")).toBe(true);
        expect(hasInvisible("plain text")).toBe(false);
    });
});
