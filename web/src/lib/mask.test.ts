// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    findIbans,
    isCard,
    isEmail,
    isIban,
    isSecret,
    maskCard,
    maskEmail,
    maskIban,
    maskSecret,
    maskText,
    maskValue,
    normalizeCard,
    normalizeEmail,
    normalizeIban,
    sensitiveKind,
} from "./mask";

const IBAN = "DE89 3704 0044 0532 0130 00";
const CARD = "4111 1111 1111 1111";
const QK_KEY = "qk_live_7f31abcd0123456789";

describe("IBANs", () => {
    it("drops spaces and upper-cases", () => {
        expect(normalizeIban("de89 3704  0044")).toBe("DE8937040044");
    });

    it("accepts IBANs that pass the mod-97 check, with or without spaces", () => {
        expect(isIban(IBAN)).toBe(true);
        expect(isIban("GB82WEST12345698765432")).toBe(true);
    });

    it("rejects a wrong check digit and a wrong shape", () => {
        expect(isIban("DE88 3704 0044 0532 0130 00")).toBe(false);
        expect(isIban("hello")).toBe(false);
    });

    it("keeps the first and last four characters", () => {
        expect(maskIban(IBAN)).toBe("DE89…3000");
    });

    it("hides a value too short to mask partly", () => {
        expect(maskIban("DE89 37")).toBe("…");
    });
});

describe("cards", () => {
    it("drops spaces and dashes", () => {
        expect(normalizeCard("4111-1111 1111-1111")).toBe("4111111111111111");
    });

    it("accepts numbers that pass the Luhn check", () => {
        expect(isCard(CARD)).toBe(true);
        expect(isCard("5555-5555-5555-4444")).toBe(true);
    });

    it("rejects a failed Luhn check and too few digits", () => {
        expect(isCard("4111 1111 1111 1112")).toBe(false);
        expect(isCard("1234")).toBe(false);
    });

    it("keeps the first and last four digits", () => {
        expect(maskCard("4111-1111-1111-1111")).toBe("4111…1111");
    });

    it("hides a value too short to mask partly", () => {
        expect(maskCard("1234")).toBe("…");
    });
});

describe("emails", () => {
    it("trims and lower-cases", () => {
        expect(normalizeEmail("  Refunds@Claims-Desk.IO ")).toBe("refunds@claims-desk.io");
    });

    it("accepts an address and rejects plain text", () => {
        expect(isEmail(" refunds@claims-desk.io ")).toBe(true);
        expect(isEmail("refunds at claims-desk")).toBe(false);
    });

    it("keeps the first letter and the domain", () => {
        expect(maskEmail("Refunds@Claims-Desk.io")).toBe("r…@claims-desk.io");
    });

    it("hides a value with no name or no at sign", () => {
        expect(maskEmail("@claims-desk.io")).toBe("…");
        expect(maskEmail("refunds")).toBe("…");
    });
});

describe("secrets", () => {
    it("knows the common key shapes", () => {
        expect(isSecret(QK_KEY)).toBe(true);
        expect(isSecret("sk-proj-abcdefghijklmnopqrstuv")).toBe(true);
        expect(isSecret("sk_live_abcdefghijklmnop")).toBe(true);
        expect(isSecret("ghp_" + "a".repeat(30))).toBe(true);
        expect(isSecret("xoxb-1234567890")).toBe(true);
        expect(isSecret("AKIAABCDEFGHIJKLMNOP")).toBe(true);
        expect(isSecret("eyJhbGc.eyJzdWI.sig")).toBe(true);
        expect(isSecret("not a key")).toBe(false);
    });

    it("keeps the known prefix and four more characters", () => {
        expect(maskSecret(` ${QK_KEY} `)).toBe("qk_live_7f31…");
        expect(maskSecret("sk-proj-abcdefghijklmnopqrstuv")).toBe("sk-proj-abcd…");
        expect(maskSecret("AKIAABCDEFGHIJKLMNOP")).toBe("AKIAABCD…");
    });

    it("keeps four characters of an unknown value", () => {
        expect(maskSecret("abcdefghijkl")).toBe("abcd…");
    });

    it("keeps at most four characters of a very short value", () => {
        expect(maskSecret("abcdef")).toBe("abcd…");
        expect(maskSecret("abc")).toBe("abc…");
    });
});

describe("sensitiveKind and maskValue", () => {
    it("names the kind of each sensitive value", () => {
        expect(sensitiveKind(IBAN)).toBe("iban");
        expect(sensitiveKind(CARD)).toBe("card");
        expect(sensitiveKind("refunds@claims-desk.io")).toBe("email");
        expect(sensitiveKind(QK_KEY)).toBe("secret");
        expect(sensitiveKind("refund approved")).toBeNull();
    });

    it("masks each kind its own way", () => {
        expect(maskValue(IBAN)).toBe("DE89…3000");
        expect(maskValue(CARD)).toBe("4111…1111");
        expect(maskValue("refunds@claims-desk.io")).toBe("r…@claims-desk.io");
        expect(maskValue(QK_KEY)).toBe("qk_live_7f31…");
    });

    it("returns plain values unchanged", () => {
        expect(maskValue("refund approved")).toBe("refund approved");
    });
});

describe("findIbans", () => {
    it("finds IBANs as written, without trailing words", () => {
        expect(findIbans(`Pay ${IBAN} REF1 and GB82WEST12345698765432 today`)).toEqual([
            IBAN,
            "GB82WEST12345698765432",
        ]);
    });

    it("skips IBAN-shaped text that fails the check", () => {
        expect(findIbans("Ref XX00 1234 5678 9012 here")).toEqual([]);
    });
});

describe("maskText", () => {
    it("masks every sensitive value inside a longer text", () => {
        const text = `Send to ${IBAN}, card ${CARD}, mail Refunds@Claims-Desk.io, key ${QK_KEY}.`;
        expect(maskText(text)).toBe("Send to DE89…3000, card 4111…1111, mail r…@claims-desk.io, key qk_live_7f31….");
    });

    it("leaves digit runs that are not card numbers alone", () => {
        expect(maskText("order 1234 5678 9012 3456 shipped")).toBe("order 1234 5678 9012 3456 shipped");
    });

    it("masks every copy of the same IBAN", () => {
        expect(maskText(`${IBAN} / ${IBAN}`)).toBe("DE89…3000 / DE89…3000");
    });
});
