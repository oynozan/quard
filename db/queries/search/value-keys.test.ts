import { createRedactor, keyedHash, parseHashKey, projectHashKey } from "@quard/shared";
import { describe, expect, it } from "vitest";
import { searchKeys } from "./value-keys.ts";

const HASH_KEY = "ab".repeat(32);
const PROJECT = "project-1";
const PROJECT_KEY = projectHashKey(parseHashKey(HASH_KEY), PROJECT);
const redactor = createRedactor(PROJECT_KEY);

// A key as ingest stores it, redacted by the SDK and again by webhook with the project's key
const stored = (key: string) => redactor.key(redactor.key(key));

describe("searchKeys for IBANs and emails", () => {
    it("builds the hashed key ingest stores for an IBAN", () => {
        const hash = keyedHash(PROJECT_KEY, "iban", "DE89370400440532013000");

        expect(searchKeys(" de89 3704 0044 0532 0130 00 ", HASH_KEY, PROJECT)).toEqual({
            status: "ready",
            kind: "iban",
            shown: "DE89…3000",
            keys: [`iban:DE89…3000#${hash}`],
        });
        expect(searchKeys("DE89370400440532013000", HASH_KEY, PROJECT)).toMatchObject({
            keys: [stored("iban:DE89370400440532013000")],
        });
    });

    it("searches an email by its own key, not by its host or domain", () => {
        expect(searchKeys("Jane@Acme.com", HASH_KEY, PROJECT)).toEqual({
            status: "ready",
            kind: "email",
            shown: "j…@acme.com",
            keys: [stored("email:jane@acme.com")],
        });
    });

    it("hashes with the project's own key, never with the install's", () => {
        const other = createRedactor(projectHashKey(parseHashKey(HASH_KEY), "project-2")).key("email:jane@acme.com");
        const install = createRedactor(parseHashKey(HASH_KEY)).key("email:jane@acme.com");

        expect(searchKeys("jane@acme.com", HASH_KEY, "project-2")).toMatchObject({ keys: [other] });
        expect(other).not.toBe(stored("email:jane@acme.com"));
        expect(install).not.toBe(stored("email:jane@acme.com"));
    });

    it("asks for the hash key when there is none", () => {
        expect(searchKeys("DE89370400440532013000", undefined, PROJECT)).toEqual({
            status: "needs-hash-key",
            kind: "iban",
            shown: "DE89…3000",
        });
        expect(searchKeys("jane@acme.com", "", PROJECT)).toEqual({
            status: "needs-hash-key",
            kind: "email",
            shown: "j…@acme.com",
        });
    });

    it("refuses a hash key that is not 64 hex characters, only for an IBAN or email", () => {
        expect(() => searchKeys("jane@acme.com", "short", PROJECT)).toThrow("64 hex characters");
        expect(searchKeys("mail.acme.co.uk", "short", PROJECT)).toMatchObject({ status: "ready", kind: "host" });
    });
});

describe("searchKeys for clear values", () => {
    it("searches a URL by its exact value, host and main domain, without the hash key", () => {
        expect(searchKeys("https://Pay.Acme.com/invoices/INV-20931#top", undefined, PROJECT)).toEqual({
            status: "ready",
            kind: "url",
            shown: "https://pay.acme.com/invoices/INV-20931",
            keys: ["url:https://pay.acme.com/invoices/INV-20931", "host:pay.acme.com", "domain:acme.com"],
        });
    });

    it("searches a host by itself and its main domain", () => {
        expect(searchKeys("mail.acme.co.uk", undefined, PROJECT)).toEqual({
            status: "ready",
            kind: "host",
            shown: "mail.acme.co.uk",
            keys: ["host:mail.acme.co.uk", "domain:acme.co.uk"],
        });
    });

    it("searches a path or an id by its exact key", () => {
        expect(searchKeys("/srv/exports/../exports/q3.csv", undefined, PROJECT)).toEqual({
            status: "ready",
            kind: "path",
            shown: "/srv/exports/q3.csv",
            keys: ["path:/srv/exports/q3.csv"],
        });
        expect(searchKeys("INV-20931", undefined, PROJECT)).toEqual({
            status: "ready",
            kind: "id",
            shown: "inv-20931",
            keys: ["id:inv-20931"],
        });
    });

    it("removes secrets from the keys and the shown text", () => {
        expect(searchKeys("https://api.acme.com/v1?token=abcdef123456", undefined, PROJECT)).toEqual({
            status: "ready",
            kind: "url",
            shown: "https://api.acme.com/v1?token=…",
            keys: ["url:https://api.acme.com/v1?token=…", "host:api.acme.com", "domain:acme.com"],
        });
    });

    it.each([
        ["https://api.acme.com/v1?token=abcdef123456", "url:https://api.acme.com/v1?token=abcdef123456"],
        ["https://acme.com/cards/4111111111111111", "url:https://acme.com/cards/4111111111111111"],
        ["mail.acme.co.uk", "host:mail.acme.co.uk"],
        ["/home/jane/sk-proj-abcdefghijklmnopqrstuvwx", "path:/home/jane/sk-proj-abcdefghijklmnopqrstuvwx"],
        ["INV-20931", "id:inv-20931"],
    ])("builds the same exact key as ingest for %s", (query, raw) => {
        expect(searchKeys(query, HASH_KEY, PROJECT)).toMatchObject({
            keys: expect.arrayContaining([stored(raw)]) as unknown,
        });
        expect(searchKeys(query, undefined, PROJECT)).toEqual(searchKeys(query, HASH_KEY, PROJECT));
    });
});

describe("searchKeys for other text", () => {
    it("flags a card number as not searchable", () => {
        expect(searchKeys("4111 1111 1111 1111", HASH_KEY, PROJECT)).toEqual({
            status: "not-searchable",
            kind: "card",
            shown: "4111…1111",
        });
        expect(searchKeys("4111-1111-1111-1111", undefined, PROJECT)).toMatchObject({ kind: "card" });
    });

    it("finds nothing to search in plain text", () => {
        expect(searchKeys("hello world", HASH_KEY, PROJECT)).toBeNull();
        expect(searchKeys("  ", HASH_KEY, PROJECT)).toBeNull();
        // A bare host needs a public suffix
        expect(searchKeys("supplier-portal.example", HASH_KEY, PROJECT)).toBeNull();
    });

    it("uses only the first value in the query", () => {
        expect(searchKeys("https://shop.acme.com/orders/ORD-77120", undefined, PROJECT)).toMatchObject({
            kind: "url",
            keys: ["url:https://shop.acme.com/orders/ORD-77120", "host:shop.acme.com", "domain:acme.com"],
        });
        // Emails come before URLs
        expect(searchKeys("https://x.com/u?e=jane@acme.com", undefined, PROJECT)).toMatchObject({ kind: "email" });
    });
});
