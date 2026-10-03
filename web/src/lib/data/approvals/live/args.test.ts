// @vitest-environment node
import { describe, expect, it } from "vitest";
import { openItem } from "../../../../../test/approvals-overview/items";
import { approvalArgOf, originsOf, parseArgs, type LabelValue } from "./args";

const WEB = { origin: "web:acme-billing.net", trust: "untrusted", sensitivity: "public" } as const;
const USER = { origin: "user", trust: "trusted", sensitivity: "internal" } as const;

function value(origins: (typeof WEB | typeof USER)[], generated = false): LabelValue {
    return {
        type: "iban",
        generated,
        origins: origins.map((label) => ({ ...label, flags: [], stepId: "1".repeat(16), match: "exact" as const })),
    };
}

describe("parseArgs", () => {
    it("pairs each full value with its mask and its labels", () => {
        const [iban, amount, memo] = parseArgs(openItem());
        expect(iban).toMatchObject({ name: "iban", value: "GB33 BUKB 2020 1555 5555", masked: "GB33…5555" });
        expect(iban.values).toHaveLength(1);
        expect(amount).toEqual({ name: "amount", value: "4950", masked: "4950", values: [] });
        expect(memo.name).toBe("memo");
    });

    it("names nested values by their path, and a plain input by 'input'", () => {
        const nested = parseArgs({
            args: { invoice: { lines: [{ amount: 10 }] }, note: null },
            masked: { invoice: { lines: [{ amount: 10 }] }, note: null },
            labels: [],
        });
        expect(nested.map((arg) => [arg.name, arg.value])).toEqual([
            ["invoice.lines[0].amount", "10"],
            ["note", "null"],
        ]);
        const plain = parseArgs({
            args: "pay GB33",
            masked: "pay GB33…",
            labels: [{ path: "", values: [value([WEB])] }],
        });
        expect(plain).toEqual([{ name: "input", value: "pay GB33", masked: "pay GB33…", values: [value([WEB])] }]);
    });

    it("has no arguments for a tool called without input, and never shows a missing mask as the value", () => {
        expect(parseArgs({ args: null, masked: null, labels: [] })).toEqual([]);
        expect(parseArgs({ args: undefined, masked: undefined, labels: [] })).toEqual([]);
        expect(parseArgs({ args: { iban: "GB33" }, masked: null, labels: [] })[0].masked).toBe("…");
    });
});

describe("originsOf", () => {
    it("keeps one label per origin, first appearance first", () => {
        expect(originsOf([value([WEB, USER]), value([WEB])])).toEqual([WEB, USER]);
        expect(originsOf([])).toEqual([]);
    });
});

describe("approvalArgOf", () => {
    it("gives the full value, its origins, and whether it is traced", () => {
        const [iban, amount] = parseArgs(openItem());
        expect(approvalArgOf(iban)).toEqual({
            name: "iban",
            value: "GB33 BUKB 2020 1555 5555",
            origins: [WEB],
            traced: true,
        });
        expect(approvalArgOf(amount)).toEqual({ name: "amount", value: "4950", origins: [], traced: false });
    });

    it("flags a value the model made up", () => {
        const arg = { name: "iban", value: "GB33", masked: "GB33", values: [value([], true)] };
        expect(approvalArgOf(arg)).toEqual({ name: "iban", value: "GB33", origins: [], generated: true, traced: true });
    });
});
