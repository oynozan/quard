// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NOW } from "@/lib/data/rng";
import { stubRandomBytes } from "../../../../test/settings/random";
import { createKey, nameProblem, pause } from "./new-key";

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("createKey", () => {
    it("builds a live key from 32 random hex characters and shows only its prefix", () => {
        stubRandomBytes();
        const draft = { name: "  billing-service ", env: "live" as const, scope: "app" as const, agents: ["billing"] };
        const { key, secret } = createKey(draft, "dana@acme.com", NOW);
        expect(secret).toBe("qk_live_000102030405060708090a0b0c0d0e0f");
        expect(key).toEqual({
            id: "key_0001",
            name: "billing-service",
            prefix: "qk_live_0001…",
            scope: "app",
            agents: ["billing"],
            createdAt: NOW,
            createdBy: "dana@acme.com",
            lastUsedAt: null,
            revokedAt: null,
            revokedBy: null,
        });
    });

    it("uses the test prefix for a test key", () => {
        stubRandomBytes();
        const draft = { name: "staging", env: "test" as const, scope: "agent" as const, agents: ["support"] };
        const { key, secret } = createKey(draft, "li.wei@acme.com", NOW);
        expect(secret).toBe("qk_test_000102030405060708090a0b0c0d0e0f");
        expect(key.prefix).toBe("qk_test_0001…");
        expect(key.scope).toBe("agent");
    });

    it("draws 16 fresh random bytes for each key", () => {
        const random = stubRandomBytes();
        const draft = { name: "a", env: "live" as const, scope: "app" as const, agents: [] };
        createKey(draft, "x", NOW);
        createKey(draft, "x", NOW);
        expect(random).toHaveBeenCalledTimes(2);
        const [[first], [second]] = random.mock.calls as [Uint8Array][];
        expect(first).toHaveLength(16);
        expect(second).not.toBe(first);
    });
});

describe("nameProblem", () => {
    it("asks for a name when it is empty or only spaces", () => {
        expect(nameProblem("   ", [])).toBe("Give the key a name, such as the app that will use it.");
    });

    it("accepts 48 characters and refuses 49", () => {
        expect(nameProblem("a".repeat(48), [])).toBeNull();
        expect(nameProblem("a".repeat(49), [])).toBe("Keep the name under 48 characters.");
    });

    it("refuses a name an active key already uses, after trimming", () => {
        expect(nameProblem(" staging ", ["staging"])).toBe("An active key already has this name.");
    });

    it("accepts a new name", () => {
        expect(nameProblem("deploy-bot", ["staging"])).toBeNull();
    });
});

describe("pause", () => {
    it("resolves only after the given time", async () => {
        vi.useFakeTimers();
        let done = false;
        void pause(700).then(() => (done = true));
        await vi.advanceTimersByTimeAsync(699);
        expect(done).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(done).toBe(true);
    });
});
