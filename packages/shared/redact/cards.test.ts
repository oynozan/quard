import { describe, expect, it } from "vitest";
import { findCards, luhnValid } from "./cards.ts";

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
