import { createRedactor, keyedHash, parseHashKey } from "@quard/shared";
import { describe, expect, it } from "vitest";
import { searchKeys } from "./value-keys.ts";

const HASH_KEY = "ab".repeat(32);
const redactor = createRedactor(parseHashKey(HASH_KEY));

// A key as ingest stores it: the SDK redacts it, then webhook does again
const stored = (key: string) => redactor.key(redactor.key(key));

describe("searchKeys for IBANs and emails", () => {
    it("builds the hashed key ingest stores for an IBAN", () => {
        const hash = keyedHash(parseHashKey(HASH_KEY), "iban", "DE89370400440532013000");

        expect(searchKeys(" de89 3704 0044 0532 0130 00 ", HASH_KEY)).toEqual({
            status: "ready",
            kind: "iban",
            shown: "DE89…3000",
            keys: [`iban:DE89…3000#${hash}`],
        });
        expect(searchKeys("DE89370400440532013000", HASH_KEY)).toMatchObject({
            keys: [stored("iban:DE89370400440532013000")],
        });
    });

    it("searches an email by its own key, not by its host or domain", () => {
        expect(searchKeys("Jane@Acme.com", HASH_KEY)).toEqual({
            status: "ready",
            kind: "email",
            shown: "j…@acme.com",
            keys: [stored("email:jane@acme.com")],
        });
    });

    it("asks for the hash key when there is none", () => {
        expect(searchKeys("DE89370400440532013000", undefined)).toEqual({
            status: "needs-hash-key",
            kind: "iban",
            shown: "DE89…3000",
        });
        expect(searchKeys("jane@acme.com", "")).toEqual({
            status: "needs-hash-key",
            kind: "email",
            shown: "j…@acme.com",
        });
    });

    it("refuses a hash key that is not 64 hex characters", () => {
        expect(() => searchKeys("jane@acme.com", "short")).toThrow("64 hex characters");
    });
});

describe("searchKeys for clear values", () => {
    it("searches a URL by its exact value, host and main domain, without the hash key", () => {
        expect(searchKeys("https://Pay.Acme.com/invoices/INV-20931#top", undefined)).toEqual({
            status: "ready",
            kind: "url",
            shown: "https://pay.acme.com/invoices/INV-20931",
            keys: ["url:https://pay.acme.com/invoices/INV-20931", "host:pay.acme.com", "domain:acme.com"],
        });
    });

    it("searches a host by itself and its main domain", () => {
        expect(searchKeys("mail.acme.co.uk", undefined)).toEqual({
            status: "ready",
            kind: "host",
            shown: "mail.acme.co.uk",
            keys: ["host:mail.acme.co.uk", "domain:acme.co.uk"],
        });
    });

    it("searches a path or an id by its exact key", () => {
        expect(searchKeys("/srv/exports/../exports/q3.csv", undefined)).toEqual({
            status: "ready",
            kind: "path",
            shown: "/srv/exports/q3.csv",
            keys: ["path:/srv/exports/q3.csv"],
        });
        expect(searchKeys("INV-20931", undefined)).toEqual({
            status: "ready",
            kind: "id",
            shown: "inv-20931",
            keys: ["id:inv-20931"],
        });
    });

    it("removes secrets from the keys and the shown text", () => {
        expect(searchKeys("https://api.acme.com/v1?token=abcdef123456", undefined)).toEqual({
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
        expect(searchKeys(query, HASH_KEY)).toMatchObject({ keys: expect.arrayContaining([stored(raw)]) as unknown });
        expect(searchKeys(query, undefined)).toEqual(searchKeys(query, HASH_KEY));
    });
});

describe("searchKeys for other text", () => {
    it("flags a card number as not searchable", () => {
        expect(searchKeys("4111 1111 1111 1111", HASH_KEY)).toEqual({
            status: "not-searchable",
            kind: "card",
            shown: "4111…1111",
        });
        expect(searchKeys("4111-1111-1111-1111", undefined)).toMatchObject({ kind: "card" });
    });

    it("finds nothing to search in plain text", () => {
        expect(searchKeys("hello world", HASH_KEY)).toBeNull();
        expect(searchKeys("  ", HASH_KEY)).toBeNull();
        // A bare host needs a public suffix
        expect(searchKeys("supplier-portal.example", HASH_KEY)).toBeNull();
    });

    it("uses only the first value in the query", () => {
        expect(searchKeys("https://shop.acme.com/orders/ORD-77120", undefined)).toMatchObject({
            kind: "url",
            keys: ["url:https://shop.acme.com/orders/ORD-77120", "host:shop.acme.com", "domain:acme.com"],
        });
        // Emails come before URLs
        expect(searchKeys("https://x.com/u?e=jane@acme.com", undefined)).toMatchObject({ kind: "email" });
    });
});
