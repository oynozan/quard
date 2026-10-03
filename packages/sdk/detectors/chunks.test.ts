import { redactText } from "@quard/shared";
import { describe, expect, it } from "vitest";
import { chunkSpans, chunkText, wellFormed, withoutSpans } from "./chunks.ts";

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

    it("cuts a long paragraph after a line break rather than inside a word", () => {
        const text = `${"a".repeat(30)}\n${"b".repeat(30)}`;

        expect(chunkText(text, 40)).toEqual([`${"a".repeat(30)}\n`, "b".repeat(30)]);
    });

    it("prefers a sentence end to a space, and repeats the text around the cut in the next chunk", () => {
        const text = `${"word ".repeat(6)}end. ${"tail ".repeat(6)}`;

        const [first, second] = chunkText(text, 40);

        expect(first).toBe(`${"word ".repeat(6)}end. `);
        expect(second).toBe(`end. ${"tail ".repeat(6)}`);
    });

    it("never cuts inside an IBAN written with spaces", () => {
        const iban = "DE89 3704 0044 0532 0130 00";
        const text = `${"x ".repeat(18)}${iban}${" y".repeat(20)}`;

        const chunks = chunkText(text, 40);

        const holding = chunks.filter((chunk) => /DE89|0044|0130/.test(chunk));
        expect(holding.length).toBeGreaterThan(0);
        expect(holding.every((chunk) => chunk.includes(iban))).toBe(true);
        expect(chunks.map(redactText).join(" ")).not.toContain("0532");
    });

    it("never cuts inside an email, even with no space to cut at", () => {
        const text = `${"!".repeat(35)}jane@acme.com${"!".repeat(30)}`;

        const chunks = chunkText(text, 40);

        expect(chunks[0]).toBe("!".repeat(35));
        expect(chunks.filter((chunk) => chunk.includes("@"))).toEqual([expect.stringContaining("jane@acme.com")]);
        expect(chunks.join("")).toBe(text);
    });

    it("keeps a secret longer than the limit whole", () => {
        const secret = `sk-${"x".repeat(60)}`;

        expect(chunkText(`${secret} and more`, 40)[0]).toBe(secret);
    });

    it("never splits a character made of two halves", () => {
        const text = `${"a".repeat(39)}😀${"b".repeat(10)}`;

        const chunks = chunkText(text, 40);

        expect(chunks).toEqual(["a".repeat(39), `😀${"b".repeat(10)}`]);
        expect(chunkText("😀😀", 1)).toEqual(["😀", "😀"]);
    });

    it("gives where each chunk sits", () => {
        expect(chunkSpans("aaaa\n\nbbbb", 6)).toEqual([
            { start: 0, end: 4 },
            { start: 6, end: 10 },
        ]);
    });
});

describe("wellFormed", () => {
    it("replaces a lone half of a character", () => {
        expect(wellFormed("a\ud83d")).toBe("a�");
        expect(wellFormed("\ude00b")).toBe("�b");
    });

    it("keeps whole characters", () => {
        expect(wellFormed("ok 😀")).toBe("ok 😀");
    });
});

describe("withoutSpans", () => {
    const text = "One.\n\nTwo.\n\nThree.";

    it("takes chunks out and keeps the rest in order", () => {
        expect(withoutSpans(text, [{ start: 6, end: 10 }])).toBe("One.\n\nThree.");
    });

    it("joins chunks that overlap, and drops what is left blank", () => {
        const spans = [
            { start: 12, end: 18 },
            { start: 0, end: 7 },
            { start: 5, end: 10 },
        ];

        expect(withoutSpans(text, spans)).toBe("");
    });

    it("keeps spaces at the end of a line it keeps", () => {
        expect(withoutSpans("kept \n\ngone", [{ start: 7, end: 11 }])).toBe("kept ");
    });
});
