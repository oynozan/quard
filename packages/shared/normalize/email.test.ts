import { describe, expect, it } from "vitest";
import { emailHost, findEmails, normalizeEmail } from "./email.ts";

describe("email", () => {
    it("normalizes case and spaces", () => {
        expect(normalizeEmail("  Bob@Acme.COM ")).toBe("bob@acme.com");
    });

    it("finds emails inside text", () => {
        expect(findEmails("Write to Bob@Acme.com or x.y+z@mail.evil.co.uk.")).toEqual([
            "bob@acme.com",
            "x.y+z@mail.evil.co.uk",
        ]);
    });

    it("stays fast on a long token with no email in it", () => {
        const started = Date.now();
        findEmails("ab1".repeat(40_000));
        expect(Date.now() - started).toBeLessThan(500);
    });

    it("reads the host", () => {
        expect(emailHost("bob@mail.acme.com")).toBe("mail.acme.com");
    });
});
