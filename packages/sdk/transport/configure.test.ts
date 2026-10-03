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

const controls = vi.hoisted(() => [] as Array<{ options: unknown; stop: ReturnType<typeof vi.fn> }>);

vi.mock("./link/control.ts", () => ({
    createControl: (options: unknown) => {
        const control = { options, stop: vi.fn() };
        controls.push(control);
        return control;
    },
}));

vi.mock("./uploader.ts", () => ({
    createUploader: (options: unknown) => {
        const uploader = { options, start: vi.fn(), stop: vi.fn(), flush: vi.fn(async () => true) };
        uploaders.push(uploader);
        return uploader;
    },
}));

const { getConfig, resetConfig } = await import("../core/config.ts");
const { activeControl } = await import("./link/active.ts");
const { configureQuard, flushUploads, stopLink, stopUploads } = await import("./configure.ts");

const SETTINGS = { key: "qk_live_abc", webhookUrl: "http://webhook.test", hashKey: "ab".repeat(32) };
const LINKED = { key: "qk_live_abc", controlUrl: "https://control.test", hashKey: "ab".repeat(32) };

afterEach(() => {
    stopUploads();
    stopLink();
    resetConfig();
    uploaders.length = 0;
    controls.length = 0;
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
        ["a key with nowhere to send", { key: "k", hashKey: "ab".repeat(32) }, "webhookUrl or controlUrl"],
        ["a control URL without a key", { controlUrl: "http://c" }, "together"],
        ["a control URL that is not http or ws", { ...LINKED, controlUrl: "ftp://c" }, "controlUrl must be"],
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

    it("starts the link to control once key, control URL and hash key are all set", () => {
        configureQuard(LINKED);

        expect(uploaders).toHaveLength(0);
        expect(controls).toHaveLength(1);
        expect(controls[0]?.options).toEqual({
            url: "wss://control.test/v1/connect",
            key: "qk_live_abc",
            hashKey: Buffer.from("ab".repeat(32), "hex"),
        });
        expect(activeControl()).toBe(controls[0]);
    });

    it("keeps the same link when other settings change, and replaces it when the link changes", () => {
        configureQuard({ ...LINKED, webhookUrl: "http://webhook.test" });
        configureQuard({ onEvent: () => {}, webhookUrl: "http://other-webhook.test" });
        expect(controls).toHaveLength(1);
        expect(uploaders).toHaveLength(2);

        configureQuard({ controlUrl: "http://control-2.test" });
        expect(controls).toHaveLength(2);
        expect(controls[0]?.stop).toHaveBeenCalled();
        expect(activeControl()).toBe(controls[1]);

        configureQuard({ controlUrl: undefined });
        expect(controls[1]?.stop).toHaveBeenCalled();
        expect(activeControl()).toBeUndefined();
    });
});
