import { describe, expect, it } from "vitest";
import { maskCard, maskEmail, maskIban } from "./masks.ts";

describe("masks", () => {
    it("keeps the first and last four characters of an IBAN", () => {
        expect(maskIban("DE89370400440532013000")).toBe("DE89…3000");
    });

    it("keeps the first and last four digits of a card", () => {
        expect(maskCard("4111111111111111")).toBe("4111…1111");
    });

    it("keeps the first letter and the domain of an email", () => {
        expect(maskEmail("jane@acme.com")).toBe("j…@acme.com");
    });
});
