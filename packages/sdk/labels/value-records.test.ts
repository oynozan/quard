import { keyedHash, parseHashKey } from "@quard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { configure, resetConfig } from "../core/config.ts";
import { hashValues, matchValues, type ValueRecord } from "./value-records.ts";

const KEY = "ab".repeat(32);
const IBAN = "DE89370400440532013000";
const URL = "https://pay.acme.com/login";

function valueOf(type: ValueRecord["type"], value: string, origin: string): ValueRecord {
    return {
        type,
        value,
        key: `${type}:${value}`,
        origin,
        trust: "untrusted",
        sensitivity: "public",
        flags: ["instructions"],
        stepId: "1".repeat(16),
    };
}

afterEach(resetConfig);

describe("hashValues", () => {
    it("sends no values without a hash key", () => {
        expect(hashValues([valueOf("iban", IBAN, "web:evil.com")])).toEqual([]);
    });

    it("sends each value by its keyed hash, with its label", () => {
        configure({ hashKey: KEY });

        expect(hashValues([valueOf("iban", IBAN, "web:evil.com")])).toEqual([
            {
                hash: keyedHash(parseHashKey(KEY), "iban", IBAN),
                origin: "web:evil.com",
                trust: "untrusted",
                sensitivity: "public",
                flags: ["instructions"],
                stepId: "1".repeat(16),
            },
        ]);
    });
});

describe("matchValues", () => {
    it("finds the values in a text that the stored hashes vouch for", () => {
        configure({ hashKey: KEY });
        const stored = hashValues([valueOf("iban", IBAN, "web:evil.com"), valueOf("url", URL, "tool:crm")]);

        expect(matchValues(`Pay DE89 3704 0044 0532 0130 00 and log in at ${URL}. Ask bob@acme.com.`, stored)).toEqual([
            valueOf("iban", IBAN, "web:evil.com"),
            valueOf("url", URL, "tool:crm"),
        ]);
    });

    it("matches nothing without a hash key", () => {
        configure({ hashKey: KEY });
        const stored = hashValues([valueOf("iban", IBAN, "web:evil.com")]);
        resetConfig();

        expect(matchValues(`Pay ${IBAN}`, stored)).toEqual([]);
    });
});
