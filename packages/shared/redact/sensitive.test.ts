import { describe, expect, it } from "vitest";
import { findSensitive, maskCard, maskIban, maskSensitive, type SensitiveKind } from "./sensitive.ts";
import { blankSpans } from "./spans.ts";

const SECRET = ["sk-", "proj-", "Zx9Qw8Er7Ty6Ui5Op4As3Df2"].join("");
const all = new Set<SensitiveKind>(["secrets", "cards", "ibans"]);
const span = (start: number, end: number) => ({ start, end, value: "x" });

describe("blankSpans", () => {
    it("blanks each span with spaces of the same length", () => {
        expect(blankSpans("abcdef", [span(4, 5), span(1, 2)])).toBe("a cd f");
    });

    it("blanks a span inside another one only once", () => {
        expect(blankSpans("abcdef", [span(1, 5), span(2, 3)])).toBe("a    f");
    });

    it("blanks spans that overlap in part", () => {
        expect(blankSpans("abcdef", [span(1, 3), span(2, 5)])).toBe("a    f");
    });
});

describe("findSensitive", () => {
    it("finds an IBAN once, not again as a card number", () => {
        expect(findSensitive("IBAN DE89 3704 0044 0532 0130 00").map((found) => found.kind)).toEqual(["ibans"]);
    });

    it("finds a secret, a card number and an IBAN in one text", () => {
        const text = `key ${SECRET}, card 4242 4242 4242 4242, iban NL91ABNA0417164300`;

        expect(findSensitive(text).map((found) => found.kind)).toEqual(["secrets", "ibans", "cards"]);
    });

    it("finds an IBAN written with double spaces", () => {
        expect(findSensitive("pay DE89  3704  0044  0532  0130  00 now")[0]).toMatchObject({
            kind: "ibans",
            value: "DE89370400440532013000",
        });
    });
});

describe("masks", () => {
    it("keeps the first and last four characters of an IBAN", () => {
        expect(maskIban("DE89370400440532013000")).toBe("DE89…3000");
    });

    it("keeps the last four digits of a card number", () => {
        expect(maskCard("4242424242424242")).toBe("•••• 4242");
    });
});

describe("maskSensitive", () => {
    it("masks only the kinds it is asked to", () => {
        const text = `card 4242 4242 4242 4242 and iban NL91 ABNA 0417 1643 00`;

        expect(maskSensitive(text, new Set(["cards"]))).toBe("card •••• 4242 and iban NL91 ABNA 0417 1643 00");
        expect(maskSensitive(text, all)).toBe("card •••• 4242 and iban NL91…4300");
    });

    it("masks a secret", () => {
        expect(maskSensitive(`use ${SECRET} today`, all)).toBe("use [secret removed by Quard] today");
    });

    it("masks the user and password of a URL as a secret", () => {
        expect(maskSensitive("use redis://user:hunter2@cache.acme.com", all)).toBe(
            "use redis://[secret removed by Quard]@cache.acme.com",
        );
    });

    it("masks a URL's user and password when the user is an email", () => {
        const text = "send via smtp://jane@acme.com:hunter2@smtp.acme.com:587";

        expect(findSensitive(text).map((found) => found.kind)).toEqual(["secrets"]);
        expect(maskSensitive(text, all)).toBe("send via smtp://[secret removed by Quard]@smtp.acme.com:587");
    });

    it("masks a whole token even when a card number sits inside it", () => {
        const token = ["eyJhbGciOiJI", "eyJzdWIiOiIx", "4242424242424242"].join(".");

        expect(maskSensitive(`t=${token}`, all)).toBe("t=[secret removed by Quard]");
    });

    it("removes hidden characters that split a value before it masks", () => {
        expect(maskSensitive("card 4242 4242\u200B 4242 4242", all)).toBe("card •••• 4242");
    });

    it("returns the text untouched when there is nothing to mask", () => {
        const text = "plain\u200B text";

        expect(maskSensitive(text, all)).toBe(text);
        expect(maskSensitive(`use ${SECRET}`, new Set(["cards"]))).toBe(`use ${SECRET}`);
    });
});
