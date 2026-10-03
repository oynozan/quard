import { keyedHash, parseHashKey } from "@quard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { configure, resetConfig } from "../core/config.ts";
import { valueHash } from "./hashed.ts";

const KEY = "ab".repeat(32);
const IBAN = "DE89370400440532013000";

describe("valueHash", () => {
    afterEach(resetConfig);

    it("is undefined without a hash key", () => {
        expect(valueHash("iban", IBAN)).toBeUndefined();
    });

    it("matches the keyed hash the redactor uses, and follows a key change", () => {
        configure({ hashKey: KEY });
        expect(valueHash("iban", IBAN)).toBe(keyedHash(parseHashKey(KEY), "iban", IBAN));
        expect(valueHash("iban", IBAN)).toBe(keyedHash(parseHashKey(KEY), "iban", IBAN));
        configure({ hashKey: "cd".repeat(32) });
        expect(valueHash("iban", IBAN)).toBe(keyedHash(parseHashKey("cd".repeat(32)), "iban", IBAN));
    });
});
