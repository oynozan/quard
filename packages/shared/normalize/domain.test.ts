import { describe, expect, it } from "vitest";
import { findHosts, hostMatches, mainDomain, normalizeHost } from "./domain.ts";

describe("domain", () => {
    it("normalizes a host", () => {
        expect(normalizeHost(" Mail.Acme.COM. ")).toBe("mail.acme.com");
    });

    it("finds the main domain", () => {
        expect(mainDomain("mail.acme.co.uk")).toBe("acme.co.uk");
        expect(mainDomain("localhost")).toBeUndefined();
        expect(mainDomain("attacker.github.io")).toBe("attacker.github.io");
    });

    it("stays fast on long dotted runs and long tokens", () => {
        const started = Date.now();
        findHosts("a.".repeat(50_000));
        expect(Date.now() - started).toBeLessThan(500);
    });

    it("finds hosts with a real public suffix only", () => {
        expect(findHosts("Visit Evil.com or files.acme.co.uk, not notes.txtx")).toEqual([
            "evil.com",
            "files.acme.co.uk",
        ]);
    });

    it("matches exact and wildcard patterns", () => {
        expect(hostMatches("acme.com", "acme.com")).toBe(true);
        expect(hostMatches("mail.acme.com", "acme.com")).toBe(false);
        expect(hostMatches("mail.acme.com", "*.acme.com")).toBe(true);
        expect(hostMatches("acme.com", "*.acme.com")).toBe(true);
        expect(hostMatches("evilacme.com", "*.acme.com")).toBe(false);
        expect(hostMatches("Evil.com.", "evil.com")).toBe(true);
    });
});
