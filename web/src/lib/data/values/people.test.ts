// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NOW } from "../rng";
import { isEmail } from "../../mask";
import { ACCOUNTS, APPROVERS } from "./people";

describe("ACCOUNTS", () => {
    it("has valid, unique emails", () => {
        const emails = ACCOUNTS.map((account) => account.email);
        expect(emails.every(isEmail)).toBe(true);
        expect(new Set(emails).size).toBe(emails.length);
    });

    it("has at least one admin", () => {
        expect(ACCOUNTS.some((account) => account.role === "admin")).toBe(true);
    });

    it("never signs in before the account exists or after now", () => {
        for (const account of ACCOUNTS) {
            expect(account.createdAt).toBeLessThan(NOW);
            if (account.lastSignInAt === null) continue;
            expect(account.lastSignInAt).toBeGreaterThan(account.createdAt);
            expect(account.lastSignInAt).toBeLessThanOrEqual(NOW);
        }
    });

    it("includes a new account that has not signed in yet", () => {
        expect(ACCOUNTS.find((account) => account.lastSignInAt === null)?.email).toBe("sam.okafor@acme.com");
    });
});

describe("APPROVERS", () => {
    it("are all dashboard accounts that have signed in", () => {
        for (const email of APPROVERS) {
            const account = ACCOUNTS.find((item) => item.email === email);
            expect(account).toBeDefined();
            expect(account?.lastSignInAt).not.toBeNull();
        }
    });
});
