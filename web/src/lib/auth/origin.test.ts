// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sameOrigin } from "./origin";

const from = (values: Record<string, string>) => sameOrigin(new Headers(values));

describe("sameOrigin", () => {
    it("accepts a request whose Origin names the host it was sent to", () => {
        expect(from({ origin: "http://localhost:3100", host: "localhost:3100" })).toBe(true);
    });

    it("refuses other sites, other ports and an Origin that is not a URL", () => {
        expect(from({ origin: "https://evil.com", host: "localhost:3100" })).toBe(false);
        expect(from({ origin: "http://localhost:3000", host: "localhost:3100" })).toBe(false);
        expect(from({ origin: "not a url", host: "localhost:3100" })).toBe(false);
        expect(from({ origin: "null", host: "localhost:3100" })).toBe(false);
    });

    it("refuses a request without an Origin or a host", () => {
        expect(from({ host: "localhost:3100" })).toBe(false);
        expect(from({ origin: "http://localhost:3100" })).toBe(false);
    });

    it("trusts the first forwarded host behind proxies, over Host", () => {
        const forwarded = {
            origin: "https://quard.acme.com",
            host: "internal:3000",
            "x-forwarded-host": "quard.acme.com, edge.internal",
        };

        expect(from(forwarded)).toBe(true);
        expect(from({ ...forwarded, origin: "http://internal:3000" })).toBe(false);
    });
});
