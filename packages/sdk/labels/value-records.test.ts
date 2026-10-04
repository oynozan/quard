import { keyedHash } from "@quard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { forgetProjectKey, learnProjectKey } from "../core/project-key.ts";
import { PROJECT_KEY, PROJECT_KEY_TEXT } from "../test/hash-key.ts";
import { hashValues, matchValues, type ValueRecord } from "./value-records.ts";

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

afterEach(forgetProjectKey);

describe("hashValues", () => {
    it("sends no values until the project's hash key is known", () => {
        expect(hashValues([valueOf("iban", IBAN, "web:evil.com")])).toEqual([]);
    });

    it("sends each value by its keyed hash, with its label", () => {
        learnProjectKey(PROJECT_KEY_TEXT);

        expect(hashValues([valueOf("iban", IBAN, "web:evil.com")])).toEqual([
            {
                hash: keyedHash(PROJECT_KEY, "iban", IBAN),
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
        learnProjectKey(PROJECT_KEY_TEXT);
        const stored = hashValues([valueOf("iban", IBAN, "web:evil.com"), valueOf("url", URL, "tool:crm")]);

        expect(matchValues(`Pay DE89 3704 0044 0532 0130 00 and log in at ${URL}. Ask bob@acme.com.`, stored)).toEqual([
            valueOf("iban", IBAN, "web:evil.com"),
            valueOf("url", URL, "tool:crm"),
        ]);
    });

    it("matches nothing without the project's hash key", () => {
        learnProjectKey(PROJECT_KEY_TEXT);
        const stored = hashValues([valueOf("iban", IBAN, "web:evil.com")]);
        forgetProjectKey();

        expect(matchValues(`Pay ${IBAN}`, stored)).toEqual([]);
    });
});
