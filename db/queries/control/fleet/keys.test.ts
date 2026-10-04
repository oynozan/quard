import { describe, expect, it } from "vitest";
import { splitFleetKey } from "./keys.ts";

describe("splitFleetKey", () => {
    it("splits a hashed key into its mask and hash", () => {
        expect(splitFleetKey(`iban:GB33…5555#${"e".repeat(32)}`)).toEqual({ value: "GB33…5555", hash: "e".repeat(32) });
        expect(splitFleetKey(`email:j…@evil.com#${"f".repeat(32)}`)).toEqual({
            value: "j…@evil.com",
            hash: "f".repeat(32),
        });
    });

    it("keeps a domain in clear, with no hash", () => {
        expect(splitFleetKey("domain:evil.com")).toEqual({ value: "evil.com", hash: null });
        expect(splitFleetKey("evil.com")).toEqual({ value: "evil.com", hash: null });
    });

    it("keeps a wallet in clear, with no hash", () => {
        expect(splitFleetKey("wallet:0x209693Bc6afc0C5328bA36FaF03C514EF312287C")).toEqual({
            value: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
            hash: null,
        });
    });
});
