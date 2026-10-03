import { describe, expect, it } from "vitest";
import { chunkText } from "./detector.ts";

describe("chunkText", () => {
    it("packs short paragraphs into one chunk", () => {
        expect(chunkText("a\n\nb\n\nc")).toEqual(["a\n\nb\n\nc"]);
    });

    it("starts a new chunk when paragraphs together pass the limit", () => {
        expect(chunkText("aaaa\n\nbbbb", 6)).toEqual(["aaaa", "bbbb"]);
    });

    it("cuts a paragraph longer than the limit", () => {
        expect(chunkText("abcdefgh", 3)).toEqual(["abc", "def", "gh"]);
    });

    it("skips empty text and blank paragraphs", () => {
        expect(chunkText("")).toEqual([]);
        expect(chunkText("a\n\n   \n\nb", 1)).toEqual(["a", "b"]);
    });
});
