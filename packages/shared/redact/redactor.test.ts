import { describe, expect, it } from "vitest";
import { keyedHash, parseHashKey } from "./hash.ts";
import { createRedactor, redactText } from "./redactor.ts";

const KEY = parseHashKey("ab".repeat(32));
const redactor = createRedactor(KEY);
const IBAN = "DE89370400440532013000";

describe("redactText", () => {
    it("masks IBANs, card numbers and emails, and removes secrets", () => {
        const text = `Pay DE89 3704 0044 0532 0130 00 with 4111 1111 1111 1111, mail Jane@Acme.com, key sk-${"x".repeat(30)}`;
        expect(redactText(text)).toBe("Pay DE89…3000 with 4111…1111, mail j…@acme.com, key sk-…");
    });

    it("masks values split by no-break spaces or hidden characters", () => {
        const nbsp = "DE89 3704 0044 0532 0130 00";
        const card = "4111​1111​1111​1111";
        const email = "ja‍ne@acme.com";
        expect(redactText(`${nbsp} ${card} ${email}`)).toBe("DE89…3000 4111…1111 j…@acme.com");
    });

    it("changes nothing the second time", () => {
        const once = redactText(`IBAN ${IBAN}, jane@acme.com, 5555555555554444`);
        expect(redactText(once)).toBe(once);
    });
});

describe("redactor.key", () => {
    it("hashes and masks sensitive keys", () => {
        expect(redactor.key(`iban:${IBAN}`)).toBe(`iban:DE89…3000#${keyedHash(KEY, "iban", IBAN)}`);
        expect(redactor.key("email:jane@acme.com")).toBe(
            `email:j…@acme.com#${keyedHash(KEY, "email", "jane@acme.com")}`,
        );
    });

    it("keeps other keys readable, minus secrets", () => {
        expect(redactor.key("host:acme.com")).toBe("host:acme.com");
        expect(redactor.key("url:https://x.io/?token=abcdef123")).toBe("url:https://x.io/?token=…");
        expect(redactor.key(`plain ${IBAN}`)).toBe("plain DE89…3000");
    });

    it("keeps a hash that is already there, but never a raw value", () => {
        const hashed = redactor.key(`iban:${IBAN}`);
        expect(redactor.key(hashed)).toBe(hashed);
        const forged = `iban:${IBAN}#${"0".repeat(32)}`;
        expect(redactor.key(forged)).toBe(`iban:DE89…3000#${"0".repeat(32)}`);
    });
});

describe("redactor.value", () => {
    it("redacts every string deeply, keys included", () => {
        const input = { to: "jane@acme.com", list: [IBAN, 5, null, true], nested: { "a@b.co": "x" } };
        expect(redactor.value(input)).toEqual({
            to: "j…@acme.com",
            list: ["DE89…3000", 5, null, true],
            nested: { "a…@b.co": "x" },
        });
    });

    it("masks a card number sent as a number, as the same digits in text", () => {
        const masked = redactor.value({ card: 4111111111111111, amex: 378282246310005, list: [5555555555554444] });

        expect(masked).toEqual({ card: "4111…1111", amex: "3782…0005", list: ["5555…4444"] });
        expect(masked).toEqual(
            redactor.value({ card: "4111111111111111", amex: "378282246310005", list: ["5555555555554444"] }),
        );
    });

    it("keeps other numbers as numbers", () => {
        const numbers = [
            4950, 4111111111111112, 1000000000000008, 1696334400000, -4111111111111111, 4111111111111111.5,
        ];

        expect(redactor.value(numbers)).toEqual(numbers);
    });

    it("checks a number past 2^53 by the digits JSON stores for it", () => {
        // A 17-digit card number that a number holds exactly
        expect(redactor.value(52222222222222344)).toBe("5222…2344");
        // A 19-digit one loses its last digits, so what is left is no card number
        const rounded: unknown = JSON.parse("4000000000000000006");
        expect(redactor.value(rounded)).toBe(rounded);
    });

    it("removes whatever a secret-named field holds", () => {
        expect(redactor.value({ password: "hunter2", token: { value: "x" }, name: "Jo" })).toEqual({
            password: "…",
            token: "…",
            name: "Jo",
        });
    });

    it("keeps nothing past the depth limit", () => {
        let deep: unknown = IBAN;
        for (let i = 0; i < 40; i++) {
            deep = [deep];
        }
        expect(JSON.stringify(redactor.value(deep))).not.toContain(IBAN);
    });
});
