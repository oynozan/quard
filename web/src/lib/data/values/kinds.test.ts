// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classify, extractValues, hostOf, looksLikeId, mainDomain, normalize, TRACED_KINDS } from "./kinds";

describe("looksLikeId", () => {
    it("accepts 8 or more characters with a digit and no spaces", () => {
        expect(looksLikeId("ABCDEFG1")).toBe(true);
        expect(looksLikeId("INV-20931")).toBe(true);
    });

    it("rejects short values, values without digits and values with spaces", () => {
        expect(looksLikeId("A123456")).toBe(false);
        expect(looksLikeId("ABCDEFGH")).toBe(false);
        expect(looksLikeId("A 1234567")).toBe(false);
    });
});

describe("classify", () => {
    it("spots IBANs, cards and emails first", () => {
        expect(classify("GB29 NWBK 6016 1331 9268 19")).toBe("iban");
        expect(classify("4111 1111 1111 1111")).toBe("card");
        expect(classify(" ap@northwind-parts.example ")).toBe("email");
    });

    it("spots URLs, paths and domains", () => {
        expect(classify("https://supplier-portal.example/suppliers")).toBe("url");
        expect(classify("/srv/exports/contacts.csv")).toBe("path");
        expect(classify("~/notes")).toBe("path");
        expect(classify("./run.sh")).toBe("path");
        expect(classify("C:\\Users\\dana")).toBe("path");
        expect(classify("report-q3.pdf")).toBe("path");
        expect(classify("claims-desk.io")).toBe("domain");
    });

    it("treats dates as plain text", () => {
        expect(classify("2026-10-03")).toBe("text");
        expect(classify("2026-10-03T12:00:00Z")).toBe("text");
    });

    it("spots amounts with or without a currency", () => {
        expect(classify("4,950.00 EUR")).toBe("amount");
        expect(classify("€312.40")).toBe("amount");
        expect(classify("12345678")).toBe("amount");
    });

    it("calls ID-like values ids and anything else text", () => {
        expect(classify("INV-20931")).toBe("id");
        expect(classify("hello")).toBe("text");
        expect(classify("")).toBe("text");
    });
});

describe("TRACED_KINDS", () => {
    it("traces typed values and ids but not amounts or text", () => {
        expect([...TRACED_KINDS].sort()).toEqual(["card", "domain", "email", "iban", "id", "path", "url"]);
    });
});

describe("normalize", () => {
    it("drops spaces from IBANs and cards", () => {
        expect(normalize(" gb29 nwbk 6016 1331 9268 19", "iban")).toBe("GB29NWBK60161331926819");
        expect(normalize("4111-1111 1111 1111", "card")).toBe("4111111111111111");
    });

    it("lowercases emails", () => {
        expect(normalize(" AP@Northwind-Parts.Example ", "email")).toBe("ap@northwind-parts.example");
    });

    it("cleans the URL host and drops fragments and trailing slashes", () => {
        expect(normalize("HTTPS://WWW.Supplier-Portal.example:443/Path/#frag", "url")).toBe(
            "https://supplier-portal.example/Path",
        );
        expect(normalize("http://example.com:8080/", "url")).toBe("http://example.com:8080");
    });

    it("lowercases domains and drops www", () => {
        expect(normalize("WWW.Claims-Desk.io", "domain")).toBe("claims-desk.io");
    });

    it("keeps the case of paths", () => {
        expect(normalize(" /Srv/A.csv ", "path")).toBe("/Srv/A.csv");
    });

    it("lowercases other values and folds their spaces", () => {
        expect(normalize("  Hello   World ", "text")).toBe("hello world");
        expect(normalize("INV-20931", "id")).toBe("inv-20931");
    });
});

describe("hostOf", () => {
    it("reads the host of a URL without www or port", () => {
        expect(hostOf("https://www.Supplier-Portal.example:443/x", "url")).toBe("supplier-portal.example");
    });

    it("gives null for a URL with no host", () => {
        expect(hostOf("http://:8080", "url")).toBeNull();
    });

    it("reads the part after the last @ of an email", () => {
        expect(hostOf("R@Claims-Desk.io", "email")).toBe("claims-desk.io");
    });

    it("cleans a domain", () => {
        expect(hostOf("WWW.claims-desk.io", "domain")).toBe("claims-desk.io");
    });

    it("gives null for kinds without a host", () => {
        expect(hostOf("/srv/a.csv", "path")).toBeNull();
    });
});

describe("mainDomain", () => {
    it("keeps short hosts as they are", () => {
        expect(mainDomain("acme.com")).toBe("acme.com");
        expect(mainDomain("localhost")).toBe("localhost");
    });

    it("keeps the last two parts", () => {
        expect(mainDomain("help.contoso-freight.example")).toBe("contoso-freight.example");
        expect(mainDomain("a.b.example.com")).toBe("example.com");
    });

    it("keeps three parts under a two-part suffix", () => {
        expect(mainDomain("mail.acme.co.uk")).toBe("acme.co.uk");
    });
});

describe("extractValues", () => {
    it("finds nothing in empty or plain text", () => {
        expect(extractValues("")).toEqual([]);
        expect(extractValues("please check the invoice")).toEqual([]);
    });

    it("finds URLs without trailing punctuation, and IDs in their path", () => {
        expect(extractValues("See https://supplier-portal.example/suppliers/SUP-004417).")).toEqual([
            { raw: "https://supplier-portal.example/suppliers/SUP-004417", kind: "url" },
            { raw: "SUP-004417", kind: "id" },
        ]);
    });

    it("keeps an email inside a URL as part of the URL", () => {
        expect(extractValues("https://x.example/?to=a@b.example")).toEqual([
            { raw: "https://x.example/?to=a@b.example", kind: "url" },
        ]);
    });

    it("finds emails as written", () => {
        expect(extractValues("Write to Remit@Northwind-Payments.example now")).toEqual([
            { raw: "Remit@Northwind-Payments.example", kind: "email" },
        ]);
    });

    it("finds IBANs written with spaces", () => {
        expect(extractValues("Pay DE89 3704 0044 0532 0130 00 today")).toEqual([
            { raw: "DE89 3704 0044 0532 0130 00", kind: "iban" },
        ]);
    });

    it("finds IDs, paths and domains once each", () => {
        expect(
            extractValues("Invoice INV-20931, saved at /srv/invoices/INV-20931.pdf; see claims-desk.io. INV-20931"),
        ).toEqual([
            { raw: "INV-20931", kind: "id" },
            { raw: "/srv/invoices/INV-20931.pdf", kind: "path" },
            { raw: "claims-desk.io", kind: "domain" },
        ]);
    });

    it("finds an ID in a file name", () => {
        expect(extractValues("/srv/exports/contacts-2026-10.csv")).toEqual([
            { raw: "/srv/exports/contacts-2026-10.csv", kind: "path" },
            { raw: "contacts-2026-10", kind: "id" },
        ]);
    });
});
