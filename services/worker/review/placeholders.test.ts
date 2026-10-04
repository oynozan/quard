import { describe, expect, it } from "vitest";
import { withPlaceholders } from "./placeholders.ts";

const HASH = "a".repeat(32);

describe("withPlaceholders", () => {
    it("numbers each masked IBAN and email, keys included", () => {
        const text = JSON.stringify({
            key: `iban:DE89…3000#${HASH}`,
            note: "Paid DE89…3000 and GB33…5555, mailed j…@acme.com",
            values: [`email:j…@acme.com#${HASH}`, `email:m…@evil-pay.com#${HASH}`],
        });

        expect(JSON.parse(withPlaceholders(text))).toEqual({
            key: "[IBAN 1]",
            note: "Paid [IBAN 1] and [IBAN 2], mailed [email 1]",
            values: ["[email 1]", "[email 2]"],
        });
    });

    it("leaves other values alone", () => {
        const text = '{"key":"url:https://invoices.evil-pay.com/inv/114","origin":"web:evil-pay.com"}';

        expect(withPlaceholders(text)).toBe(text);
    });
});
