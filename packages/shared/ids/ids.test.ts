import { afterEach, describe, expect, it, vi } from "vitest";
import { isRunId, isStepId, newRunId, newStepId } from "./ids.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("newRunId", () => {
    it("returns 32 lowercase hex characters", () => {
        expect(newRunId()).toMatch(/^[0-9a-f]{32}$/);
    });

    it("returns a different id each time", () => {
        expect(newRunId()).not.toBe(newRunId());
    });

    it("never returns an id of all zeros", () => {
        const real = crypto.getRandomValues.bind(crypto);
        let calls = 0;
        vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
            calls += 1;
            // The first draw is all zeros, so a second draw is needed
            return calls === 1 ? array : real(array);
        });

        const id = newRunId();

        expect(calls).toBe(2);
        expect(isRunId(id)).toBe(true);
    });
});

describe("newStepId", () => {
    it("returns 16 lowercase hex characters", () => {
        expect(newStepId()).toMatch(/^[0-9a-f]{16}$/);
    });
});

describe("isRunId", () => {
    it("accepts a valid run id", () => {
        expect(isRunId("4bf92f3577b34da6a3ce929d0e0e4736")).toBe(true);
    });

    it.each([
        ["too short", "4bf92f35"],
        ["upper case", "4BF92F3577B34DA6A3CE929D0E0E4736"],
        ["not hex", "zzf92f3577b34da6a3ce929d0e0e4736"],
        ["all zeros", "00000000000000000000000000000000"],
    ])("rejects an id that is %s", (_, value) => {
        expect(isRunId(value)).toBe(false);
    });
});

describe("isStepId", () => {
    it("accepts a valid step id", () => {
        expect(isStepId("00f067aa0ba902b7")).toBe(true);
    });

    it.each([
        ["too long", "00f067aa0ba902b7aa"],
        ["all zeros", "0000000000000000"],
    ])("rejects an id that is %s", (_, value) => {
        expect(isStepId(value)).toBe(false);
    });
});
