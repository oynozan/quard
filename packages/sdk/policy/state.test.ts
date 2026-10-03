import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takeEvents } from "../core/recorder.ts";
import { tempDir, writeJson } from "../test/files.ts";
import { resetAll } from "../test/reset.ts";
import { PRESETS } from "./presets.ts";
import {
    currentPreset,
    effectiveDetectorRules,
    feedMissing,
    openSources,
    policyOptions,
    policyOrigins,
    policyVersion,
    refreshSources,
    signatureFeed,
    signatureMode,
    sourcesReady,
} from "./state.ts";

const FEED_URL = "https://feeds.example.com/s.json";
const FEED = {
    version: "f1",
    signatures: [{ id: "T-1", title: "t", category: "other", where: ["input"], any: ["evil()"], action: "block" }],
};

let fetch = vi.fn(async (_url: string) => new Response(JSON.stringify(FEED)));

beforeEach(() => {
    fetch = vi.fn(async (_url: string) => new Response(JSON.stringify(FEED)));
    vi.stubGlobal("fetch", fetch);
});

afterEach(() => {
    resetAll();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("without a policy file or feed", () => {
    it("uses the balanced preset and the settings from code", async () => {
        await sourcesReady();
        refreshSources(Date.now());

        expect(policyOptions("t")).toBeUndefined();
        expect(policyVersion()).toBeUndefined();
        expect(policyOrigins()).toBeUndefined();
        expect(currentPreset()).toBe(PRESETS.balanced);
        expect(effectiveDetectorRules({ flagAt: 0.7 })).toEqual({ mode: "enforce", flagAt: 0.7, stripAt: 0.9 });
        expect(signatureFeed()).toBeUndefined();
        expect(feedMissing()).toBe(false);
        expect(signatureMode()).toBe("block");
    });

    it("keeps the defaults for detector rules left undefined", () => {
        const unset = { mode: undefined, flagAt: undefined, stripAt: 0.95 };

        expect(effectiveDetectorRules(unset)).toEqual({ mode: "enforce", flagAt: 0.5, stripAt: 0.95 });
    });
});

describe("a policy file", () => {
    it("gives guard options, origins, the preset, detector rules and its version", () => {
        const path = writeJson(join(tempDir(), "p.json"), {
            version: 7,
            strictness: "strict",
            origins: { "mcp:crm": { trust: "trusted" } },
            detector: { mode: "enforce" },
            guards: { pay: [{ type: "approval" }] },
        });

        openSources(path, undefined);

        expect(policyOptions("pay")).toEqual([{ type: "approval" }]);
        expect(policyOptions("other")).toBeUndefined();
        expect(policyVersion()).toBe("7");
        expect(policyOrigins()).toEqual({ "mcp:crm": { trust: "trusted" } });
        expect(currentPreset()).toBe(PRESETS.strict);
        expect(effectiveDetectorRules({ mode: "observe", flagAt: 0.6 })).toEqual({
            mode: "enforce",
            flagAt: 0.6,
            stripAt: 0.9,
        });
    });

    it("reads a relative feed path from its own folder, and its feed wins over the code's", () => {
        const dir = tempDir();
        writeJson(join(dir, "feed.json"), FEED);
        const path = writeJson(join(dir, "p.json"), {
            version: "1",
            signatures: { file: "feed.json", mode: "observe" },
        });

        openSources(path, { url: FEED_URL });

        expect(signatureFeed()?.version).toBe("f1");
        expect(signatureMode()).toBe("observe");
        expect(fetch).not.toHaveBeenCalled();
    });

    it("keeps an absolute feed path as it is", () => {
        const feed = writeJson(join(tempDir(), "feed.json"), FEED);
        const path = writeJson(join(tempDir(), "p.json"), { version: "1", signatures: { file: feed } });

        openSources(path, undefined);

        expect(signatureFeed()?.version).toBe("f1");
        expect(signatureMode()).toBe("block");
    });

    it("throws on a broken file and keeps the sources in use", () => {
        const dir = tempDir();
        openSources(writeJson(join(dir, "good.json"), { version: "good" }), undefined);
        const bad = writeJson(join(dir, "bad.json"), { version: "bad", guards: { t: [{ type: "nope" }] } });

        expect(() => openSources(bad, undefined)).toThrow("Quard could not load the policy file");
        expect(() => openSources(join(dir, "missing.json"), undefined)).toThrow("ENOENT");
        expect(policyVersion()).toBe("good");
    });

    it("rereads a change and keeps the last good version when a change is broken", () => {
        vi.useFakeTimers({ toFake: ["Date"], now: 0 });
        const path = writeJson(join(tempDir(), "p.json"), { version: "1" });
        openSources(path, undefined);

        writeJson(path, { version: "2" });
        refreshSources(1000);
        expect(policyVersion()).toBe("2");

        writeJson(path, "{ broken");
        refreshSources(2000);
        expect(policyVersion()).toBe("2");
        expect(takeEvents()).toEqual([expect.objectContaining({ type: "config_error", source: "policy" })]);
    });
});

describe("a signature feed", () => {
    it("throws on a broken feed file", () => {
        const path = writeJson(join(tempDir(), "feed.json"), { version: "f", signatures: [{ id: "bad id" }] });

        expect(() => openSources(undefined, { file: path })).toThrow("Quard could not load the signature feed");
    });

    it("downloads a URL feed in the background", async () => {
        openSources(undefined, { url: FEED_URL, refreshSeconds: 60, mode: "observe" });
        expect(feedMissing()).toBe(true);

        await sourcesReady();

        expect(feedMissing()).toBe(false);
        expect(signatureFeed()?.version).toBe("f1");
        expect(signatureMode()).toBe("observe");
        expect(fetch).toHaveBeenCalledWith(FEED_URL, expect.anything());
    });

    it("records a config_error when the first download fails", async () => {
        fetch.mockResolvedValueOnce(new Response("down", { status: 503 }));
        openSources(undefined, { url: FEED_URL });

        await sourcesReady();

        expect(feedMissing()).toBe(true);
        expect(takeEvents()).toMatchObject([
            { type: "config_error", source: "signatures", message: `${FEED_URL}: HTTP 503` },
        ]);
    });
});
