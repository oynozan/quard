// @vitest-environment node
import { describe, expect, it } from "vitest";
import { argsHash, keyedHash } from "./hash";

describe("keyedHash", () => {
    it("gives 32 lowercase hex characters", () => {
        expect(keyedHash("de89370400440532013000")).toMatch(/^[0-9a-f]{32}$/);
    });

    it("gives the same hash for the same value every time", () => {
        expect(keyedHash("remit@northwind-payments.example")).toBe(keyedHash("remit@northwind-payments.example"));
    });

    it("gives different hashes for different values", () => {
        expect(keyedHash("a")).not.toBe(keyedHash("b"));
        expect(keyedHash("")).not.toBe(keyedHash(" "));
    });
});

describe("argsHash", () => {
    const args = [
        { name: "to", value: "GB29 NWBK 6016 1331 9268 19" },
        { name: "amount", value: "4,950.00 EUR" },
    ];

    it("ignores the order of the arguments", () => {
        expect(argsHash("billing", "pay_invoice", args)).toBe(argsHash("billing", "pay_invoice", [...args].reverse()));
    });

    it("ignores case, outer spaces and repeated spaces in values", () => {
        const messy = [
            { name: "amount", value: "  4,950.00   eur " },
            { name: "to", value: "gb29 nwbk  6016 1331 9268 19" },
        ];
        expect(argsHash("billing", "pay_invoice", messy)).toBe(argsHash("billing", "pay_invoice", args));
    });

    it("does not reorder the caller's array", () => {
        const copy = [...args];
        argsHash("billing", "pay_invoice", copy);
        expect(copy).toEqual(args);
    });

    it("changes with the agent, the tool or a value", () => {
        const base = argsHash("billing", "pay_invoice", args);
        expect(argsHash("support", "pay_invoice", args)).not.toBe(base);
        expect(argsHash("billing", "send_email", args)).not.toBe(base);
        expect(argsHash("billing", "pay_invoice", [{ name: "to", value: "other" }, args[1]])).not.toBe(base);
    });

    it("hashes the agent, tool and normalized pairs with the install key", () => {
        expect(argsHash("billing", "pay_invoice", args)).toBe(
            keyedHash("billing|pay_invoice|amount=4,950.00 eur&to=gb29 nwbk 6016 1331 9268 19"),
        );
    });
});
