import { ibanFrom, isValidIban } from "@quard/shared";
import { describe, expect, it } from "vitest";
import { IBAN_KEY } from "../test/runs.ts";
import { standInsOf, withStandIns } from "./standins.ts";

const HASH = "465bcfb6141c9e5101e0a138e207ed3b";
const EMAIL_KEY = `email:j…@acme.com#${HASH}`;

describe("standInsOf", () => {
    it("builds a valid IBAN and an email on the same domain from each hash", () => {
        const [iban, email] = standInsOf([IBAN_KEY, EMAIL_KEY, "url:https://acme.com", "id:2026-114"]);

        expect(iban).toMatchObject({ mask: "DE89…3000", keys: [IBAN_KEY] });
        expect(isValidIban(String(iban?.value))).toBe(true);
        expect(iban?.value).toMatch(/^DE\d{20}$/);
        expect(iban?.asKey).toBe(`iban:${iban?.value}`);
        expect(email).toEqual({
            mask: "j…@acme.com",
            value: "465bcfb6141c@acme.com",
            keys: [EMAIL_KEY],
            asKey: "email:465bcfb6141c@acme.com",
        });
    });

    it("skips an IBAN of an unknown country and shares one stand-in per mask", () => {
        const other = `iban:DE89…3000#${"b".repeat(32)}`;
        const standIns = standInsOf([`iban:ZZ12…3456#${HASH}`, IBAN_KEY, other, IBAN_KEY]);

        expect(standIns).toHaveLength(1);
        expect(standIns[0]?.keys).toEqual([IBAN_KEY, other]);
        expect(standIns[0]?.value).toBe(ibanFrom("DE", "b".repeat(32)));
    });
});

describe("withStandIns", () => {
    it("replaces each mask in the body, the longest first", () => {
        const standIns = [
            { mask: "j…@acme.com", value: "aaa@acme.com", keys: [], asKey: "" },
            { mask: "j…@acme.com.evil", value: "bbb@acme.com.evil", keys: [], asKey: "" },
        ];

        const body = withStandIns({ input: [{ content: "mail j…@acme.com or j…@acme.com.evil" }] }, standIns);

        expect(body).toEqual({ input: [{ content: "mail aaa@acme.com or bbb@acme.com.evil" }] });
    });
});
