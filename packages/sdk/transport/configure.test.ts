import { afterEach, describe, expect, it, vi } from "vitest";

const uploaders = vi.hoisted(
    () =>
        [] as Array<{
            options: unknown;
            start: ReturnType<typeof vi.fn>;
            stop: ReturnType<typeof vi.fn>;
            flush: ReturnType<typeof vi.fn>;
        }>,
);

vi.mock("./uploader.ts", () => ({
    createUploader: (options: unknown) => {
        const uploader = { options, start: vi.fn(), stop: vi.fn(), flush: vi.fn(async () => true) };
        uploaders.push(uploader);
        return uploader;
    },
}));

const { getConfig, resetConfig } = await import("../core/config.ts");
const { configureQuard, flushUploads, stopUploads } = await import("./configure.ts");

const SETTINGS = { key: "qk_live_abc", webhookUrl: "http://webhook.test", hashKey: "ab".repeat(32) };

afterEach(() => {
    stopUploads();
    resetConfig();
    uploaders.length = 0;
});

describe("configureQuard", () => {
    it("changes settings without uploads when none are set", async () => {
        configureQuard({ origins: { user: { trust: "untrusted" } } });

        expect(getConfig().origins).toEqual({ user: { trust: "untrusted" } });
        expect(uploaders).toHaveLength(0);
        expect(await flushUploads()).toBe(true);
    });

    it("starts uploads once key, webhook URL and hash key are all set", async () => {
        configureQuard(SETTINGS);

        expect(uploaders).toHaveLength(1);
        expect(uploaders[0]?.options).toMatchObject({ key: "qk_live_abc", webhookUrl: "http://webhook.test" });
        expect(uploaders[0]?.start).toHaveBeenCalled();
        expect(await flushUploads()).toBe(true);
        expect(uploaders[0]?.flush).toHaveBeenCalled();
    });

    it("keeps the same uploader when other settings change, and replaces it when uploads change", () => {
        configureQuard(SETTINGS);
        configureQuard({ onEvent: () => {} });
        expect(uploaders).toHaveLength(1);

        configureQuard({ key: "qk_live_other" });
        expect(uploaders).toHaveLength(2);
        expect(uploaders[0]?.stop).toHaveBeenCalled();

        configureQuard({ key: undefined, webhookUrl: undefined, hashKey: undefined });
        expect(uploaders[1]?.stop).toHaveBeenCalled();
    });

    it.each([
        ["a missing hash key", { key: "k", webhookUrl: "http://w" }, "together"],
        ["a bad hash key", { ...SETTINGS, hashKey: "short" }, "64 hex characters"],
    ])("refuses %s and leaves the old settings", (_, options, message) => {
        expect(() => configureQuard(options)).toThrow(message);
        expect(getConfig()).toEqual({ origins: {} });
    });

    it("flushes when the process is about to exit", () => {
        configureQuard(SETTINGS);
        process.emit("beforeExit", 0);

        expect(uploaders[0]?.flush).toHaveBeenCalled();

        stopUploads();
        expect(() => process.emit("beforeExit", 0)).not.toThrow();
    });
});
