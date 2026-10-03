import { describe, expect, it } from "vitest";
import { isCard, normalizeCard, replaceCards } from "./cards.ts";

describe("isCard", () => {
    it.each(["4111111111111111", "5555555555554444", "378282246310005"])("accepts %s", (digits) => {
        expect(isCard(digits)).toBe(true);
    });

    it.each([
        ["a failed Luhn check", "4111111111111112"],
        ["a prefix no network uses", "1234567812345670"],
        ["too few digits", "411111111111"],
    ])("rejects %s", (_, digits) => {
        expect(isCard(digits)).toBe(false);
    });
});

describe("replaceCards", () => {
    it("replaces card numbers written with spaces or dashes", () => {
        const mark = (digits: string) => `<${digits}>`;
        expect(replaceCards("Card 4111 1111 1111 1111, or 5555-5555-5555-4444.", mark)).toBe(
            "Card <4111111111111111>, or <5555555555554444>.",
        );
    });

    it("leaves other long numbers alone", () => {
        expect(replaceCards("Order 4111111111111112 at 1696334400000", () => "x")).toBe(
            "Order 4111111111111112 at 1696334400000",
        );
    });

    it("normalizes separators away", () => {
        expect(normalizeCard("4111 1111-1111 1111")).toBe("4111111111111111");
    });
});
