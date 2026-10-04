import { keyedHash } from "@quard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { forgetProjectKey, learnProjectKey } from "../core/project-key.ts";
import { PROJECT_KEY, PROJECT_KEY_TEXT, projectKeyOf } from "../test/hash-key.ts";
import { valueHash } from "./hashed.ts";

const IBAN = "DE89370400440532013000";

describe("valueHash", () => {
    afterEach(forgetProjectKey);

    it("is undefined until the project's hash key is known", () => {
        expect(valueHash("iban", IBAN)).toBeUndefined();
    });

    it("matches the keyed hash the redactor uses, and follows a new key", () => {
        learnProjectKey(PROJECT_KEY_TEXT);
        expect(valueHash("iban", IBAN)).toBe(keyedHash(PROJECT_KEY, "iban", IBAN));
        learnProjectKey(projectKeyOf("other"));
        expect(valueHash("iban", IBAN)).toBe(keyedHash(Buffer.from(projectKeyOf("other"), "hex"), "iban", IBAN));
    });
});
