import { describe, expect, it } from "vitest";
import { findIbans, ibanFrom, isValidIban, normalizeIban, replaceIbans } from "./iban.ts";

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

describe("replaceIbans", () => {
    it("replaces each IBAN where it sits, spaced or not", () => {
        const text = "Pay DE89 3704 0044 0532 0130 00 now, or GB82WEST12345698765432.";
        expect(replaceIbans(text, (iban) => `<${iban.slice(0, 4)}>`)).toBe("Pay <DE89> now, or <GB82>.");
    });

    it("leaves text without IBANs alone", () => {
        expect(replaceIbans("No IBAN in DE89370400440532013001", () => "x")).toBe("No IBAN in DE89370400440532013001");
    });
});

describe("ibanFrom", () => {
    it("makes a valid IBAN of the country's length from the seed", () => {
        const seed = "0123456789abcdef0123456789abcdef";
        const iban = ibanFrom("DE", seed);

        expect(iban).toMatch(/^DE\d{20}$/);
        expect(isValidIban(String(iban))).toBe(true);
        expect(iban?.slice(4)).toBe(BigInt(`0x${seed}`).toString().slice(0, 18));
        expect(ibanFrom("DE", seed)).toBe(iban);
        expect(ibanFrom("DE", "ff".repeat(16))).not.toBe(iban);
    });

    it("pads a short seed and keeps one-digit check digits", () => {
        const all = Array.from({ length: 200 }, (_, n) => ibanFrom("NO", n.toString(16)));

        expect(all[1]).toMatch(/^NO\d{2}0{10}1$/);
        expect(all.every((iban) => isValidIban(String(iban)))).toBe(true);
        expect(all.some((iban) => iban?.charAt(2) === "0")).toBe(true);
    });

    it("gives nothing for a country without IBANs", () => {
        expect(ibanFrom("XX", "ab")).toBeUndefined();
        expect(ibanFrom("constructor", "ab")).toBeUndefined();
    });
});
