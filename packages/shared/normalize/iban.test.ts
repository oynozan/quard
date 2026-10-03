import { describe, expect, it } from "vitest";
import { findIbans, isValidIban, normalizeIban } from "./iban.ts";

const VALID = "DE89370400440532013000";

describe("normalizeIban", () => {
    it("drops spaces and upper-cases", () => {
        expect(normalizeIban("de89 3704 0044 0532 0130 00")).toBe(VALID);
    });
});

describe("isValidIban", () => {
    it("accepts valid IBANs from several countries", () => {
        expect(isValidIban(VALID)).toBe(true);
        expect(isValidIban("GB82 WEST 1234 5698 7654 32")).toBe(true);
        expect(isValidIban("NO9386011117947")).toBe(true);
    });

    it.each([
        ["a wrong check digit", "DE89370400440532013001"],
        ["a wrong length", "DE8937040044053201300"],
        ["an unknown country", "ZZ89370400440532013000"],
        ["a bad shape", "1234"],
    ])("rejects %s", (_, value) => {
        expect(isValidIban(value)).toBe(false);
    });
});

describe("findIbans", () => {
    it("finds a spaced IBAN followed by more words", () => {
        expect(findIbans("Pay DE89 3704 0044 0532 0130 00 now please")).toEqual([VALID]);
    });

    it("finds IBANs that sit next to each other", () => {
        expect(findIbans("DE89 3704 0044 0532 0130 00 GB82WEST12345698765432")).toEqual([
            VALID,
            "GB82WEST12345698765432",
        ]);
    });

    it("finds a valid IBAN after an invalid look-alike", () => {
        expect(findIbans("XX12 DE89370400440532013000")).toEqual([VALID]);
    });

    it("finds IBANs in lower case", () => {
        expect(findIbans("iban: de89370400440532013000.")).toEqual([VALID]);
    });

    it("skips look-alikes that fail the checks", () => {
        expect(findIbans("Order ZZ12 3456 7890 1234 5678 and DE89370400440532013001")).toEqual([]);
    });
});
