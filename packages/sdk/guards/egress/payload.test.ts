import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openSources } from "../../policy/state.ts";
import { makeCall } from "../../test/call.ts";
import { tempDir, writeJson } from "../../test/files.ts";
import { resetAll } from "../../test/reset.ts";
import type { EgressOptions } from "../options.ts";
import { checkPayload, maskArgs } from "./payload.ts";

afterEach(() => {
    resetAll();
});

// Joined at run time, so the source holds no key-shaped text
const SECRET = ["sk-", "proj-", "Zx9Qw8Er7Ty6Ui5Op4As3Df2"].join("");
const CARD = "4242 4242 4242 4242";
const IBAN = "DE89370400440532013000";
const egress: EgressOptions = { type: "egress" };

function useStrictness(strictness: "lenient" | "balanced" | "strict"): void {
    openSources(writeJson(join(tempDir(), "p.json"), { version: "1", strictness }), undefined);
}

describe("checkPayload", () => {
    it("finds nothing in plain data", () => {
        expect(checkPayload(makeCall({ body: "See you at 10." }), egress)).toEqual([]);
    });

    it("blocks a secret and allows an IBAN under the balanced preset", () => {
        expect(checkPayload(makeCall({ body: `key ${SECRET}`, iban: IBAN }), egress)).toEqual([
            {
                guard: "egress",
                rule: "payload:secrets",
                decision: "block",
                mode: "block",
                reason: "sensitive_data",
                field: "secret",
            },
            { guard: "egress", rule: "payload:ibans:allow", decision: "allow", mode: "block" },
        ]);
    });

    it("blocks a card number that masking could not change, such as a number", () => {
        expect(checkPayload(makeCall({ card: 4242424242424242 }), egress)).toMatchObject([
            { rule: "payload:cards", decision: "block", field: "card number" },
        ]);
    });

    it("only records a mask in observe mode", () => {
        expect(checkPayload(makeCall({ body: CARD }), { type: "egress", mode: "observe" })).toEqual([
            { guard: "egress", rule: "payload:cards:mask", decision: "allow", mode: "observe" },
        ]);
    });

    it("lets the guard's payload option win over the preset", () => {
        const options: EgressOptions = { type: "egress", payload: { secrets: "allow", ibans: "block" } };

        expect(checkPayload(makeCall({ body: SECRET, iban: IBAN }), options)).toMatchObject([
            { rule: "payload:secrets:allow", decision: "allow" },
            { rule: "payload:ibans", decision: "block", field: "IBAN" },
        ]);
    });
});

describe("maskArgs", () => {
    it("masks a card number in the strings an enforcing egress guard sends", () => {
        expect(maskArgs([egress], [{ to: "bob@acme.com", body: `card ${CARD}` }])).toEqual([
            { to: "bob@acme.com", body: "card •••• 4242" },
        ]);
    });

    it("returns nothing when there is nothing to mask", () => {
        expect(maskArgs([egress], [{ body: "See you at 10." }])).toBeUndefined();
    });

    it("skips egress guards in observe mode and other guard types", () => {
        expect(maskArgs([{ type: "egress", mode: "observe" }, { type: "limit" }], [CARD])).toBeUndefined();
    });

    it("skips a guard that allows every kind", () => {
        const options: EgressOptions = {
            type: "egress",
            payload: { secrets: "allow", cards: "allow", ibans: "allow" },
        };

        expect(maskArgs([options], [CARD])).toBeUndefined();
    });

    it("leaves arguments that are not plain data to the checks", () => {
        class Mail {
            body = CARD;
        }

        expect(maskArgs([egress], [new Mail()])).toBeUndefined();
    });

    it("masks IBANs and secrets under the presets that say so", () => {
        expect(maskArgs([egress], [IBAN])).toBeUndefined();
        useStrictness("strict");
        expect(maskArgs([egress], [IBAN])).toEqual(["DE89…3000"]);
        useStrictness("lenient");
        expect(maskArgs([egress], [`key ${SECRET}`])).toEqual(["key [secret removed by Quard]"]);
    });
});
