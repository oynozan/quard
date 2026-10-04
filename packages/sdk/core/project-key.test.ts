import { keyedHash } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_KEY, PROJECT_KEY_TEXT, projectKeyOf } from "../test/hash-key.ts";
import { forgetProjectKey, learnProjectKey, projectKey, projectRedactor, waitForProjectKey } from "./project-key.ts";

const IBAN = "DE89370400440532013000";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    forgetProjectKey();
    vi.useRealTimers();
});

describe("the project's hash key", () => {
    it("is unknown until control or webhook hands it out", () => {
        expect(projectKey()).toBeUndefined();
        expect(projectRedactor()).toBeUndefined();

        learnProjectKey(PROJECT_KEY_TEXT);

        expect(projectKey()).toEqual(PROJECT_KEY);
        expect(projectRedactor()?.key(`iban:${IBAN}`)).toBe(`iban:DE89…3000#${keyedHash(PROJECT_KEY, "iban", IBAN)}`);
    });

    it("keeps the same redactor for the same key, and takes a new key", () => {
        learnProjectKey(PROJECT_KEY_TEXT);
        const first = projectRedactor();
        learnProjectKey(PROJECT_KEY_TEXT);
        expect(projectRedactor()).toBe(first);

        learnProjectKey(projectKeyOf("other"));

        expect(projectRedactor()).not.toBe(first);
        expect(projectKey()?.toString("hex")).toBe(projectKeyOf("other"));
    });

    it("is forgotten, as for another agent key", () => {
        learnProjectKey(PROJECT_KEY_TEXT);

        forgetProjectKey();

        expect(projectKey()).toBeUndefined();
    });
});

describe("waitForProjectKey", () => {
    it("hands out a known key at once", async () => {
        learnProjectKey(PROJECT_KEY_TEXT);

        expect(await waitForProjectKey(1000)).toEqual(PROJECT_KEY);
    });

    it("wakes every call that waits once the key comes", async () => {
        const first = waitForProjectKey(1000);
        const second = waitForProjectKey(1000);

        learnProjectKey(PROJECT_KEY_TEXT);

        expect(await Promise.all([first, second])).toEqual([PROJECT_KEY, PROJECT_KEY]);
        // Their timers are gone
        expect(vi.getTimerCount()).toBe(0);
    });

    it("gives up after the wait", async () => {
        const waited = waitForProjectKey(1000);

        await vi.advanceTimersByTimeAsync(1000);

        expect(await waited).toBeUndefined();
        learnProjectKey(PROJECT_KEY_TEXT);
    });

    it("gives up once the call it waits on settles, or takes the key it brought", async () => {
        const failed = waitForProjectKey(1000, Promise.reject(new Error("webhook down")));
        const answered = waitForProjectKey(
            1000,
            Promise.resolve().then(() => learnProjectKey(PROJECT_KEY_TEXT)),
        );

        expect(await failed).toBeUndefined();
        expect(await answered).toEqual(PROJECT_KEY);
    });
});
