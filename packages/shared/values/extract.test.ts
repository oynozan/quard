import { describe, expect, it } from "vitest";
import { extractValues } from "./extract.ts";

describe("extractValues", () => {
    it("finds typed values with their keys", () => {
        const values = extractValues(
            "Pay DE89 3704 0044 0532 0130 00 via https://pay.evil.co.uk/x or bob@Mail.Acme.com",
        );

        expect(values).toContainEqual({
            type: "iban",
            value: "DE89370400440532013000",
            keys: ["iban:DE89370400440532013000"],
        });
        expect(values).toContainEqual({
            type: "url",
            value: "https://pay.evil.co.uk/x",
            keys: ["url:https://pay.evil.co.uk/x", "host:pay.evil.co.uk", "domain:evil.co.uk"],
        });
        expect(values).toContainEqual({
            type: "email",
            value: "bob@mail.acme.com",
            keys: ["email:bob@mail.acme.com", "host:mail.acme.com", "domain:acme.com"],
        });
    });

    it("finds paths and ID-like values", () => {
        expect(extractValues("delete /etc/passwd for INV-2026-0042")).toEqual([
            { type: "path", value: "/etc/passwd", keys: ["path:/etc/passwd"] },
            { type: "id", value: "inv-2026-0042", keys: ["id:inv-2026-0042"] },
        ]);
    });

    it("gives hosts without a main domain only a host key", () => {
        expect(extractValues("http://localhost:3000/a")).toEqual([
            { type: "url", value: "http://localhost:3000/a", keys: ["url:http://localhost:3000/a", "host:localhost"] },
        ]);
    });

    it("sees through hidden characters and lists each value once", () => {
        const values = extractValues("DE89\u200B370400440532013000 and DE89370400440532013000");

        expect(values.filter((value) => value.type === "iban")).toHaveLength(1);
    });

    it("does not repeat an IBAN as an ID or a URL host as a host", () => {
        const values = extractValues("DE89370400440532013000 at https://evil.com/x and bob@acme.com, also other.org");

        expect(values.map((value) => value.type)).toEqual(["iban", "email", "url", "host"]);
        expect(values.at(-1)?.value).toBe("other.org");
    });

    it("reads values split by hidden marks or extra spaces", () => {
        const soft = String.fromCodePoint(0xad);
        const values = extractValues(`DE89  3704  0044  0532  0130  00 and x@ev${soft}il.com`);

        expect(values.map((value) => value.value)).toEqual(["DE89370400440532013000", "x@evil.com"]);
    });

    it("returns nothing for plain words, dates and amounts", () => {
        expect(extractValues("Accounts Payable, 2026-10-03, 4950.00")).toEqual([]);
    });
});
