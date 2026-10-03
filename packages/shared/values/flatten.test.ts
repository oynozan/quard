import { describe, expect, it } from "vitest";
import { flattenArgs, valueAtPath } from "./flatten.ts";

describe("flattenArgs", () => {
    it("splits nested objects and arrays", () => {
        expect(
            flattenArgs({ to: ["a@x.com", "b@y.com"], invoice: { iban: "DE89", amount: 4950, paid: false } }),
        ).toEqual([
            { path: "to[0]", value: "a@x.com" },
            { path: "to[1]", value: "b@y.com" },
            { path: "invoice.iban", value: "DE89" },
            { path: "invoice.amount", value: "4950" },
        ]);
    });

    it("handles plain values, big integers and empty values", () => {
        expect(flattenArgs("hi")).toEqual([{ path: "", value: "hi" }]);
        expect(flattenArgs(10n)).toEqual([{ path: "", value: "10" }]);
        expect(flattenArgs(null)).toEqual([]);
        expect(flattenArgs(undefined)).toEqual([]);
    });

    it("stops at cycles", () => {
        const input: Record<string, unknown> = { a: "x" };
        input.self = input;
        input.list = [input, "y"];

        expect(flattenArgs(input)).toEqual([
            { path: "a", value: "x" },
            { path: "list[1]", value: "y" },
        ]);
    });
});

describe("valueAtPath", () => {
    it("reads top-level and nested values", () => {
        const input = { amount: 5, invoice: { iban: "DE89" } };

        expect(valueAtPath(input, "amount")).toBe(5);
        expect(valueAtPath(input, "invoice.iban")).toBe("DE89");
        expect(valueAtPath({ items: [{ amount: 7 }] }, "items[0].amount")).toBe(7);
    });

    it("returns undefined for missing paths", () => {
        expect(valueAtPath({ a: 1 }, "a.b")).toBeUndefined();
        expect(valueAtPath(null, "a")).toBeUndefined();
        expect(valueAtPath({}, "missing")).toBeUndefined();
    });
});
