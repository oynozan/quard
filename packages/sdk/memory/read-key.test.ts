import { afterEach, describe, expect, it, vi } from "vitest";
import { newScope } from "../context/scope.ts";
import { printOf } from "../labels/print.ts";
import { resetAll } from "../test/reset.ts";
import { lookupLabels, waitForKey } from "../transport/labels.ts";
import { keepLabels } from "./kept.ts";
import { readThrough } from "./read.ts";

vi.mock("../transport/labels.ts", () => ({
    storeLabels: vi.fn(),
    lookupLabels: vi.fn(async () => undefined),
    waitForKey: vi.fn(async () => false),
}));

// A read while the backend's hash key has not come

const NOTE = "Weekly note: all good.";

afterEach(() => {
    resetAll();
    vi.clearAllMocks();
});

describe("readThrough without the project's key", () => {
    it("looks nothing up, as the backend knows no print made without it, and uses what it kept", async () => {
        keepLabels(printOf(NOTE), {
            label: { trust: "trusted", sensitivity: "internal", origins: [], flagged: false },
            values: [],
        });

        expect(await readThrough(newScope(), "notes", false, async () => NOTE)).toBe(NOTE);

        expect(waitForKey).toHaveBeenCalledTimes(1);
        expect(lookupLabels).not.toHaveBeenCalled();
    });
});
