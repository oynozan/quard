// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    between,
    chance,
    createRng,
    DAY,
    HOUR,
    isRunId,
    MINUTE,
    NOW,
    pick,
    randomHex,
    randomInt,
    SECOND,
    seedFrom,
} from "./rng";

describe("createRng", () => {
    it("gives the same numbers for the same seed", () => {
        const a = createRng(42);
        const b = createRng(42);
        const first = [a(), a(), a()];
        expect([b(), b(), b()]).toEqual(first);
        expect(new Set(first).size).toBe(3);
    });

    it("gives different numbers for a different seed", () => {
        expect(createRng(1)()).not.toBe(createRng(2)());
    });

    it("stays between 0 and 1", () => {
        const rng = createRng(7);
        for (let i = 0; i < 500; i++) {
            const value = rng();
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });
});

describe("helpers", () => {
    // A stand-in that returns the given numbers in turn.
    const fixed = (...values: number[]) => {
        let i = 0;
        return () => values[i++];
    };

    it("picks whole numbers with both ends included", () => {
        expect(randomInt(fixed(0), 3, 6)).toBe(3);
        expect(randomInt(fixed(0.999), 3, 6)).toBe(6);
    });

    it("picks an item from the list", () => {
        expect(pick(fixed(0), ["a", "b", "c"])).toBe("a");
        expect(pick(fixed(0.5), ["a", "b", "c"])).toBe("b");
    });

    it("builds lowercase hex of the asked length", () => {
        expect(randomHex(fixed(0, 0.999, 0.625), 3)).toBe("0fa");
        expect(randomHex(createRng(3), 32)).toMatch(/^[0-9a-f]{32}$/);
        expect(randomHex(createRng(3), 0)).toBe("");
    });

    it("says yes only below the probability", () => {
        expect(chance(fixed(0.2), 0.5)).toBe(true);
        expect(chance(fixed(0.5), 0.5)).toBe(false);
    });

    it("scales a number into the range", () => {
        expect(between(fixed(0), 10, 20)).toBe(10);
        expect(between(fixed(0.25), 10, 20)).toBe(12.5);
    });
});

describe("seedFrom", () => {
    it("hashes text to a stable unsigned 32-bit number", () => {
        expect(seedFrom("")).toBe(0x811c9dc5);
        expect(seedFrom("a")).toBe(0xe40c292c);
        expect(seedFrom("run-1")).toBe(seedFrom("run-1"));
        expect(seedFrom("run-1")).not.toBe(seedFrom("run-2"));
    });
});

describe("isRunId", () => {
    it("accepts 32 lowercase hex characters only", () => {
        expect(isRunId("4bf92f3577b34da6a3ce929d0e0e4736")).toBe(true);
        expect(isRunId("4BF92F3577B34DA6A3CE929D0E0E4736")).toBe(false);
        expect(isRunId("4bf92f3577b34da6a3ce929d0e0e473")).toBe(false);
        expect(isRunId("zzf92f3577b34da6a3ce929d0e0e4736")).toBe(false);
    });
});

describe("time constants", () => {
    it("treats 3 Oct 2026, 18:40 UTC as now", () => {
        expect(new Date(NOW).toISOString()).toBe("2026-10-03T18:40:00.000Z");
        expect([SECOND, MINUTE, HOUR, DAY]).toEqual([1000, 60_000, 3_600_000, 86_400_000]);
    });
});
