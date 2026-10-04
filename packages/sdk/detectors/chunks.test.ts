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

    it("cuts once before a value longer than the limit, not in a run of tiny chunks", () => {
        const text = `${"w ".repeat(30)}sk-${"x".repeat(60)} done`;

        const ends = chunkSpans(text, 40).map((span) => span.end);

        expect(ends).toEqual([...new Set(ends)]);
    });

    it("never cuts inside an IBAN or card written with no-break spaces", () => {
        const iban = "DE89 3704 0044 0532 0130 00";
        const card = "5555 5555 5555 4444";
        const text = `${"x ".repeat(18)}${iban}${" y".repeat(14)}${card}${" z".repeat(20)}`;

        const sent = chunkText(text, 40).map(redactText).join(" ");

        expect(sent).not.toMatch(/0532|5555 5555/);
    });

    it("never cuts inside a secret found by its name", () => {
        const token = "a1b2c3d4".repeat(8);
        const text = `{"data":"aa","refresh_token":"${token}","more":"${"b".repeat(30)}"}`;

        const sent = chunkText(text, 40).map(redactText).join(" ");

        expect(sent).toContain('refresh_token":"…');
        expect(sent).not.toContain(token.slice(24, 40));
    });

    it("never splits a private key at a blank line inside it", () => {
        const body = "a1B2c3D4".repeat(8);
        const key = [
            "-----BEGIN RSA PRIVATE KEY-----",
            "Proc-Type: 4,ENCRYPTED",
            "DEK-Info: AES-128-CBC,0A1B2C3D4E5F",
            "",
            body,
            body,
            "-----END RSA PRIVATE KEY-----",
        ].join("\n");

        const sent = chunkText(`${"Intro words here. ".repeat(3)}\n\n${key}`, 80).map(redactText);

        expect(sent).toEqual([`${"Intro words here. ".repeat(3)}`, "[private key]"]);
    });

    it("never cuts a private key after a key id found inside it", () => {
        const body = "a1B2c3D4".repeat(4);
        const key = ["-----BEGIN PRIVATE KEY-----", ["AKIA", "IOSFODNN7EXAMPLE"].join(""), body, body, body].join("\n");

        const sent = chunkText(`${"w ".repeat(20)}${key}\n-----END PRIVATE KEY----- done`, 60).map(redactText);

        expect(sent.join(" ")).not.toContain(body);
    });

    it("cuts a long run of card numbers in time that grows with the text, not its square", () => {
        const text = "4111 1111 1111 1111,".repeat(80_000);

        const timed = () => {
            const started = performance.now();
            return { spans: chunkSpans(text), ms: performance.now() - started };
        };
        // The faster of two runs, so a busy machine doesn't fail it. Square time took 7 s.
        const [first, second] = [timed(), timed()];

        expect(first.spans.at(-1)?.end).toBe(text.length);
        expect(Math.min(first.ms, second.ms)).toBeLessThan(2500);
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
