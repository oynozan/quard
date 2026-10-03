import { createRedactor, parseHashKey } from "@quard/shared";
import { describe, expect, it } from "vitest";
import { makeCall } from "../../test/call.ts";
import { checkFleet, fleetChunks, fleetResult, fleetValues, isEnforced, type FleetView } from "./fleet.ts";

const redactor = createRedactor(parseHashKey("ab".repeat(32)));
const IBAN = "DE89370400440532013000";
const IBAN_KEY = redactor.key(`iban:${IBAN}`);
// 120 different main domains in one field
const HOSTS = Array.from({ length: 120 }, (_, n) => `https://site${n}.com`).join(" ");

function view(entries: Record<string, boolean>, pastObserve = true): FleetView {
    return {
        redactor,
        entry: (key) => (key in entries ? { key, observe: entries[key] as boolean } : undefined),
        pastObserve: () => pastObserve,
    };
}

describe("fleetValues", () => {
    it("finds IBANs, emails and main domains in the watched fields, hashed", () => {
        const input = {
            payee: { iban: `IBAN ${IBAN}` },
            to: ["jane@mail.acme.co.uk", "https://pay.evil-pay.com/x"],
            note: "ignored: bob@other.com",
        };

        const values = fleetValues(input, ["payee", "to"], redactor);

        expect(values).toEqual([
            { field: "payee", kind: "iban", key: IBAN_KEY },
            { field: "to", kind: "email", key: redactor.key("email:jane@mail.acme.co.uk") },
            { field: "to", kind: "domain", key: "domain:acme.co.uk" },
            { field: "to", kind: "domain", key: "domain:evil-pay.com" },
        ]);
        expect(JSON.stringify(values)).not.toContain(IBAN);
        expect(JSON.stringify(values)).not.toContain("jane@");
    });

    it("skips values it can't watch, and lists each key once", () => {
        const input = { url: "/local/path x9f8a7b6c5d4 https://ACME.com/a https://acme.com/b" };

        expect(fleetValues(input, ["url", "missing"], redactor)).toEqual([
            { field: "url", kind: "domain", key: "domain:acme.com" },
        ]);
        // Control refuses a value without a field name
        expect(fleetValues(input, [""], redactor)).toEqual([]);
    });

    it("keeps domains in clear, even ones that look like keys", () => {
        const input = { url: "https://sk-abcdefghijklmnopqrstuvwx.com/pay https://xoxb-1234567890-abc.com" };

        expect(fleetValues(input, ["url"], redactor)).toEqual([
            { field: "url", kind: "domain", key: "domain:sk-abcdefghijklmnopqrstuvwx.com" },
            { field: "url", kind: "domain", key: "domain:xoxb-1234567890-abc.com" },
        ]);
    });

    it("keeps every value, and splits them into reports of at most 100", () => {
        const values = fleetValues({ urls: HOSTS }, ["urls"], redactor);

        expect(values).toHaveLength(120);
        expect(fleetChunks(values).map((chunk) => chunk.length)).toEqual([100, 20]);
        expect(fleetChunks([])).toEqual([]);
    });
});

describe("checkFleet", () => {
    const options = { type: "limit" as const, fleetCheck: ["iban"] };

    it("does nothing without watched fields or a synced list", () => {
        const call = makeCall({ iban: IBAN });

        expect(checkFleet(call, { type: "limit" }, "block", view({}))).toEqual([]);
        expect(checkFleet(call, options, "block", undefined)).toEqual([]);
    });

    it("allows values that are not quarantined", () => {
        expect(checkFleet(makeCall({ iban: IBAN }), options, "block", view({}))).toEqual([
            { guard: "limit", rule: "fleet-check", decision: "allow", mode: "block" },
        ]);
    });

    it("blocks a quarantined value only when everything enforces it", () => {
        const call = makeCall({ iban: IBAN });

        expect(checkFleet(call, options, "block", view({ [IBAN_KEY]: false }))).toEqual([fleetResult("iban", true)]);
        expect(checkFleet(call, options, "block", view({ [IBAN_KEY]: true }))[0]?.mode).toBe("observe");
        expect(checkFleet(call, options, "block", view({ [IBAN_KEY]: false }, false))[0]?.mode).toBe("observe");
        expect(checkFleet(call, options, "observe", view({ [IBAN_KEY]: false }))[0]?.mode).toBe("observe");
    });

    it("blocks on an enforced value listed after one that only observes", () => {
        const call = makeCall({ to: "https://watch.com https://evil.com" });
        const fleet = view({ "domain:watch.com": true, "domain:evil.com": false });

        expect(checkFleet(call, { type: "limit", fleetCheck: ["to"] }, "block", fleet)).toEqual([
            fleetResult("to", true),
        ]);
    });

    it("checks values past the first 100", () => {
        const fleet = view({ "domain:site119.com": false });

        expect(checkFleet(makeCall({ urls: HOSTS }), { type: "limit", fleetCheck: ["urls"] }, "block", fleet)).toEqual([
            fleetResult("urls", true),
        ]);
    });

    it("says why in the result", () => {
        expect(fleetResult("iban", true)).toEqual({
            guard: "limit",
            rule: "fleet-check",
            decision: "block",
            mode: "block",
            reason: "value_quarantined",
            field: "iban",
        });
        expect(isEnforced("block", { key: "k", observe: false }, true)).toBe(true);
    });
});
