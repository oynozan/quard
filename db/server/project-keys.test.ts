import { createRedactor, keyedHash, parseHashKey, projectHashKey } from "@quard/shared";
import { describe, expect, it } from "vitest";
import { projectKeys } from "./project-keys.ts";

const INSTALL_KEY = parseHashKey("ab".repeat(32));
const IBAN = "DE89370400440532013000";

describe("projectKeys", () => {
    it("gives each project its own key, made from the install's key, as hex", () => {
        const keys = projectKeys(INSTALL_KEY);

        expect(keys.hashKey("project-1")).toBe(projectHashKey(INSTALL_KEY, "project-1").toString("hex"));
        expect(keys.hashKey("project-1")).toMatch(/^[0-9a-f]{64}$/);
        expect(keys.hashKey("project-2")).not.toBe(keys.hashKey("project-1"));
        expect(keys.hashKey("project-1")).not.toBe(INSTALL_KEY.toString("hex"));
    });

    it("hashes with the project's key, never with the install's", () => {
        const keys = projectKeys(INSTALL_KEY);
        const own = projectHashKey(INSTALL_KEY, "project-1");
        const hashed = keys.redactor("project-1").key(`iban:${IBAN}`);

        expect(hashed).toBe(`iban:DE89…3000#${keyedHash(own, "iban", IBAN)}`);
        expect(keys.redactor("project-2").key(`iban:${IBAN}`)).not.toBe(hashed);
        expect(createRedactor(INSTALL_KEY).key(`iban:${IBAN}`)).not.toBe(hashed);
    });

    it("makes a project's redactor once, and keeps those of the last 10,000 projects", () => {
        const keys = projectKeys(INSTALL_KEY);
        const first = keys.redactor("project-0");
        expect(keys.redactor("project-0")).toBe(first);

        for (let n = 1; n <= 10_000; n += 1) {
            keys.redactor(`project-${n}`);
        }

        expect(keys.redactor("project-10000")).toBe(keys.redactor("project-10000"));
        const again = keys.redactor("project-0");
        expect(again).not.toBe(first);
        expect(again.key(`iban:${IBAN}`)).toBe(first.key(`iban:${IBAN}`));
    });
});
