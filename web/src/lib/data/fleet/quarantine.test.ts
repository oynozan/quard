// @vitest-environment node
import { describe, expect, it } from "vitest";
import { keyedHash } from "../values/hash";
import { normalize } from "../values/kinds";
import { PLANTED } from "../values/pool";
import { quarantined, watched } from "./quarantine";

describe("quarantined", () => {
    it("masks IBANs and emails but shows domains in clear", () => {
        expect(quarantined().map((row) => [row.kind, row.value])).toEqual([
            ["iban", "LT12…1000"],
            ["domain", "nwparts-secure.example"],
            ["email", "r…@northwind-payments.example"],
        ]);
    });

    it("hashes the normalized raw value, never the mask", () => {
        const [iban, domain] = quarantined();

        expect(iban.hash).toBe(keyedHash(normalize(PLANTED.quarantinedIban, "iban")));
        expect(domain.hash).toBe(keyedHash(normalize(PLANTED.lookalikeDomain, "domain")));
        expect(iban.hash).toMatch(/^[0-9a-f]{32}$/);
    });

    it("lists values blocked after their 5th run, with attempts and agents", () => {
        for (const row of quarantined()) {
            expect(row.runs).toBe(5);
            expect(row.quarantinedAt).toBeGreaterThan(row.firstSeenAt);
        }
        expect(quarantined()[2]).toMatchObject({ field: "to", blockedAttempts: 2, agents: ["billing", "support"] });
    });
});

describe("watched", () => {
    it("lists values still under 5 runs, masked", () => {
        const rows = watched();

        expect(rows.map((row) => row.value)).toEqual([
            "DE89…3000",
            "r…@claims-desk.io",
            "c…@claims-desk.io",
            "a…@claims-desk.io",
            "AT61…3201",
        ]);
        expect(rows.every((row) => row.runs < 5)).toBe(true);
        expect(rows[0].hash).toBe(keyedHash(normalize(PLANTED.storyIban, "iban")));
    });
});
