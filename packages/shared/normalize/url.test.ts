import { describe, expect, it } from "vitest";
import { findUrls, normalizeUrl, urlHost } from "./url.ts";

describe("normalizeUrl", () => {
    it("lower-cases the host, drops the default port and the fragment", () => {
        expect(normalizeUrl("HTTPS://Evil.COM:443/inv?id=1#top")).toBe("https://evil.com/inv?id=1");
    });

    it("rejects text that is not a web address", () => {
        expect(normalizeUrl("not a url")).toBeUndefined();
        expect(normalizeUrl("ftp://files.acme.com/a")).toBeUndefined();
    });
});

describe("findUrls", () => {
    it("finds addresses and trims trailing punctuation", () => {
        expect(findUrls("See https://Evil.com/inv, then (http://a.io/x).")).toEqual([
            "https://evil.com/inv",
            "http://a.io/x",
        ]);
    });

    it("skips matches that do not parse", () => {
        expect(findUrls("broken http://[nope")).toEqual([]);
    });
});

describe("urlHost", () => {
    it("reads the host", () => {
        expect(urlHost("https://mail.acme.co.uk/x")).toBe("mail.acme.co.uk");
        expect(urlHost("https://evil.com./inv")).toBe("evil.com");
    });
});
