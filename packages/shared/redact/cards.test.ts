import { describe, expect, it } from "vitest";
import { findCards, isCard, luhnValid, normalizeCard, replaceCards } from "./cards.ts";

const values = (text: string) => findCards(text).map((span) => span.value);

describe("luhnValid", () => {
    it.each(["4242424242424242", "4111111111111111", "5555555555554444", "378282246310005"])("accepts %s", (digits) => {
        expect(luhnValid(digits)).toBe(true);
    });

    it("rejects a number with one digit changed", () => {
        expect(luhnValid("4242424242424241")).toBe(false);
    });
});

describe("findCards", () => {
    it.each([
        ["spaces", "card 4242 4242 4242 4242 ok", "4242424242424242"],
        ["dashes", "card 5555-5555-5555-4444", "5555555555554444"],
        ["no separators", "4111111111111111", "4111111111111111"],
        ["Amex groups", "amex 3782 822463 10005", "378282246310005"],
    ])("finds a card number written with %s", (_, text, expected) => {
        expect(values(text)).toEqual([expected]);
    });

    it("skips a number that fails the Luhn check", () => {
        expect(values("4242 4242 4242 4241")).toEqual([]);
    });

    it("skips a Luhn-valid number without a card prefix", () => {
        expect(values("order 1000000000000008")).toEqual([]);
    });

    it("skips short numbers and amounts", () => {
        expect(values("total 4950.00, order 123456")).toEqual([]);
    });
});

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
