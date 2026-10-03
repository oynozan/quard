import { describe, expect, it } from "vitest";
import { isPlain, snapshot } from "./snapshot.ts";

class Money {
    total = 5;
}

describe("isPlain", () => {
    it("accepts primitives, arrays, plain and prototype-free objects, and cycles", () => {
        const cyclic: Record<string, unknown> = { a: 1 };
        cyclic.self = cyclic;

        expect(isPlain([1, "a", null, undefined, 2n, { b: [true] }, Object.create(null)])).toBe(true);
        expect(isPlain(cyclic)).toBe(true);
    });

    it("rejects class instances, functions and symbols", () => {
        expect(isPlain({ money: new Money() })).toBe(false);
        expect(isPlain([() => 1])).toBe(false);
        expect(isPlain({ s: Symbol("x") })).toBe(false);
    });
});

describe("snapshot", () => {
    it("copies plain arguments", () => {
        const args = [{ amount: 1 }];
        const copy = snapshot(args);
        args[0]!.amount = 999;

        expect(copy).toEqual([{ amount: 1 }]);
    });

    it("leaves other arguments as they are", () => {
        const args = [new Money()];

        expect(snapshot(args)).toBe(args);
    });
});
