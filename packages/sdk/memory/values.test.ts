import { keyedHash, labelFor } from "@quard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { forgetProjectKey, learnProjectKey } from "../core/project-key.ts";
import { ContentIndex } from "../labels/content-index.ts";
import { valueHash } from "../labels/hashed.ts";
import { PROJECT_KEY, PROJECT_KEY_TEXT } from "../test/hash-key.ts";
import { localHash, valueRecords } from "./values.ts";

const IBAN = "DE89370400440532013000";
const STEP_A = "00f067aa0ba902b7";
const STEP_B = "1111222233334444";

afterEach(() => {
    forgetProjectKey();
});

describe("localHash", () => {
    it("is the project's key's hash once the key is known", () => {
        learnProjectKey(PROJECT_KEY_TEXT);

        expect(localHash("iban", IBAN)).toBe(keyedHash(PROJECT_KEY, "iban", IBAN));
    });

    it("uses a key of this process until then", () => {
        const hash = localHash("iban", IBAN);

        expect(hash).toMatch(/^[0-9a-f]{32}$/);
        expect(localHash("iban", IBAN)).toBe(hash);
        expect(localHash("id", IBAN)).not.toBe(hash);
        learnProjectKey(PROJECT_KEY_TEXT);
        expect(localHash("iban", IBAN)).not.toBe(hash);
    });
});

describe("valueRecords", () => {
    it("lists each traced value with the label of its first exact occurrence", () => {
        const index = new ContentIndex();
        index.add(`Bank details: ${IBAN}`, labelFor("web:evil.com", {}, ["instructions"]), STEP_A);
        index.add(`Supplier IBAN ${IBAN}, mail bob@acme.com`, labelFor("tool:crm"), STEP_B);

        const records = valueRecords(`Pay ${IBAN} and tell bob@acme.com`, index, localHash);

        expect(records).toEqual([
            {
                hash: localHash("iban", IBAN),
                origin: "web:evil.com",
                trust: "untrusted",
                sensitivity: "public",
                flags: ["instructions"],
                stepId: STEP_A,
            },
            {
                hash: localHash("email", "bob@acme.com"),
                origin: "tool:crm",
                trust: "trusted",
                sensitivity: "internal",
                flags: [],
                stepId: STEP_B,
            },
        ]);
    });

    it("leaves out values found nowhere, look-alike hosts, and values with no hash", () => {
        const index = new ContentIndex();
        index.add(`Mail alice@acme.com about ${IBAN}`, labelFor("tool:crm"), STEP_A);

        // The host of bob@acme.com matches, but only the address itself vouches
        expect(valueRecords("Write to bob@acme.com about order 2026-0001-X", index, localHash)).toEqual([]);
        expect(valueRecords(`Pay ${IBAN}`, index, valueHash)).toEqual([]);
    });

    it("trims long origins and flags to the record limits", () => {
        const index = new ContentIndex();
        const flags = Array.from({ length: 25 }, (_, i) => `${"f".repeat(120)}${i}`);
        index.add(`Pay ${IBAN}`, labelFor(`web:${"a".repeat(2100)}.com`, {}, flags), STEP_A);

        const [record] = valueRecords(IBAN, index, localHash);

        expect(record?.origin).toHaveLength(2000);
        expect(record?.flags).toHaveLength(20);
        expect(record?.flags.every((flag) => flag.length === 100)).toBe(true);
    });

    it("lists at most 500 values", () => {
        const index = new ContentIndex();
        const text = Array.from({ length: 501 }, (_, i) => `ref${String(i).padStart(6, "0")}x`).join(" ");
        index.add(text, labelFor("tool:crm"), STEP_A);

        expect(valueRecords(text, index, localHash)).toHaveLength(500);
    });
});
