import { describe, expect, it } from "vitest";
import { makeCall } from "../../test/call.ts";
import { checkAction, matchesOrigin, readAmount } from "./action.ts";

const IBAN = "DE89370400440532013000";
const fromSupplier = { type: "action" as const, rules: [{ field: "iban", from: ["tool:getSupplier"] }] };

describe("from rule", () => {
    it("allows a value that came from the named origin", () => {
        const call = makeCall({ iban: IBAN }, [["tool:getSupplier", `IBAN ${IBAN}`]]);

        expect(checkAction(call, fromSupplier)).toEqual([
            { guard: "action", rule: "iban:from", decision: "allow", mode: "block" },
        ]);
    });

    it("blocks a value that came from somewhere else", () => {
        const call = makeCall({ iban: IBAN }, [["web:evil.com", `IBAN ${IBAN}`]]);

        expect(checkAction(call, fromSupplier)[0]).toMatchObject({
            decision: "block",
            reason: "value_not_from_allowed_origin",
            field: "iban",
        });
    });

    it("blocks a model-generated value", () => {
        expect(checkAction(makeCall({ iban: IBAN }), fromSupplier)[0]).toMatchObject({
            decision: "block",
            reason: "value_model_generated",
        });
    });

    it("blocks when the field holds no traceable value", () => {
        expect(checkAction(makeCall({ iban: "unknown" }), fromSupplier)[0]?.decision).toBe("block");
    });

    it("can ask instead, and runs in observe mode", () => {
        const options = {
            type: "action" as const,
            mode: "observe" as const,
            rules: [{ name: "supplier-iban", field: "iban", from: ["tool"], onFail: "ask" as const }],
        };

        expect(checkAction(makeCall({ iban: IBAN }), options)[0]).toMatchObject({
            rule: "supplier-iban",
            decision: "ask",
            mode: "observe",
        });
    });
});

describe("from rule look-alikes and flags", () => {
    it("does not count an address that only shares the host", () => {
        const call = makeCall({ to: "attacker@gmail.com" }, [["tool:crm", "contact alice@gmail.com"]]);
        const options = { type: "action" as const, rules: [{ field: "to", from: ["tool:crm"] }] };

        expect(checkAction(call, options)[0]?.decision).toBe("block");
    });

    it("does not count flagged content as a trusted source", () => {
        const call = makeCall({ iban: IBAN }, [["tool:getSupplier", `IBAN ${IBAN}`, ["instructions"]]]);

        expect(checkAction(call, fromSupplier)[0]?.decision).toBe("block");
    });
});

describe("max rule", () => {
    const capped = { type: "action" as const, rules: [{ field: "amount", max: 1000 }] };

    it("allows amounts up to the cap and missing amounts", () => {
        expect(checkAction(makeCall({ amount: 1000 }), capped)[0]?.decision).toBe("allow");
        expect(checkAction(makeCall({ amount: "999.5" }), capped)[0]?.decision).toBe("allow");
        expect(checkAction(makeCall({}), capped)[0]?.decision).toBe("allow");
    });

    it("blocks amounts over the cap and amounts that are not numbers", () => {
        expect(checkAction(makeCall({ amount: 1001 }), capped)[0]).toMatchObject({
            rule: "amount:max",
            decision: "block",
            reason: "amount_over_cap",
        });
        expect(checkAction(makeCall({ amount: "lots" }), capped)[0]?.decision).toBe("block");
    });

    it("can ask and be named", () => {
        const options = {
            type: "action" as const,
            rules: [{ name: "cap", field: "amount", max: 1, onFail: "ask" as const }],
        };

        expect(checkAction(makeCall({ amount: 2 }), options)[0]).toMatchObject({ rule: "cap", decision: "ask" });
    });
});

describe("never-seen rule", () => {
    const rules = { type: "action" as const, rules: [{ field: "to", neverSeen: true as const }] };

    it("allows a recipient seen in trusted content", () => {
        const call = makeCall({ to: "bob@acme.com" }, [["user", "email bob@acme.com please"]]);

        expect(checkAction(call, rules)[0]).toMatchObject({ rule: "to:never-seen", decision: "allow" });
    });

    it("asks about a recipient only seen in untrusted content", () => {
        const call = makeCall({ to: "x@evil.com" }, [["web:evil.com", "write to x@evil.com"]]);

        expect(checkAction(call, rules)[0]).toMatchObject({ decision: "ask", reason: "recipient_never_seen" });
    });

    it("judges by where the value first appeared", () => {
        const call = makeCall({ to: "x@evil.com" }, [
            ["web:evil.com", "write to x@evil.com"],
            ["user", "ok, use x@evil.com"],
        ]);

        expect(checkAction(call, rules)[0]?.decision).toBe("ask");
    });

    it("asks about a value first seen in flagged trusted content", () => {
        const call = makeCall({ to: "x@a.com" }, [["tool:inbox", "mail x@a.com", ["instructions"]]]);

        expect(checkAction(call, rules)[0]?.decision).toBe("ask");
    });

    it("does not count a host match as seen", () => {
        const call = makeCall({ to: "stranger@gmail.com" }, [["user", "my mail is me@gmail.com"]]);

        expect(checkAction(call, rules)[0]?.decision).toBe("ask");
    });

    it("asks when the field has no traceable value, and can block or be named", () => {
        const strict = {
            type: "action" as const,
            rules: [{ name: "seen", field: "to", neverSeen: true as const, onFail: "block" as const }],
        };

        expect(checkAction(makeCall({ to: "nobody" }), rules)[0]?.decision).toBe("ask");
        expect(checkAction(makeCall({ to: "a@b.com" }), strict)[0]).toMatchObject({ rule: "seen", decision: "block" });
    });
});

describe("custom rule", () => {
    it("uses the decision the check returns", () => {
        const options = {
            type: "action" as const,
            rules: [
                { name: "plain", check: () => "allow" as const },
                { name: "with-field", check: () => ({ decision: "block" as const, field: "path" }) },
                { name: "no-field", check: () => ({ decision: "ask" as const }) },
            ],
        };

        expect(checkAction(makeCall({}), options)).toEqual([
            { guard: "action", rule: "plain", decision: "allow", mode: "block" },
            {
                guard: "action",
                rule: "with-field",
                decision: "block",
                mode: "block",
                reason: "rule_failed",
                field: "path",
            },
            {
                guard: "action",
                rule: "no-field",
                decision: "ask",
                mode: "block",
                reason: "rule_failed",
                field: "argument",
            },
        ]);
    });
});

describe("helpers", () => {
    it("matches origins by kind or exactly", () => {
        expect(matchesOrigin("tool:getSupplier", ["tool"])).toBe(true);
        expect(matchesOrigin("tool:getSupplier", ["tool:getSupplier"])).toBe(true);
        expect(matchesOrigin("tool:getSupplierX", ["tool:getSupplier"])).toBe(false);
    });

    it("reads amounts", () => {
        expect(readAmount({ a: { b: "12" } }, "a.b")).toBe(12);
        expect(readAmount({}, "a")).toBeUndefined();
    });
});
