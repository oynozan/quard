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
const { forgetProjectKey, learnProjectKey, projectKey } = await import("../core/project-key.ts");
const { hashKeyAnswer, PROJECT_KEY, PROJECT_KEY_TEXT } = await import("../test/hash-key.ts");
const { activeControl } = await import("./link/active.ts");
const { configureQuard, flushUploads, sendLabels, stopLink, stopUploads, uploadsOn } = await import("./configure.ts");

const SETTINGS = { key: "qk_live_abc", webhookUrl: "http://webhook.test" };
const LINKED = { key: "qk_live_abc", controlUrl: "https://control.test" };

type Redactors = { redactor: () => Promise<unknown> };

afterEach(() => {
    stopUploads();
    stopLink();
    resetConfig();
    forgetProjectKey();
    vi.unstubAllGlobals();
    uploaders.length = 0;
    controls.length = 0;
});

// Webhook's answer to every request: the project's key, or a stored label record
function webhookAnswers() {
    const fetch = vi.fn(async (url: string) =>
        url.endsWith("/v1/hash-key") ? hashKeyAnswer() : new Response("{}", { status: 201 }),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
}

describe("configureQuard", () => {
    it("changes settings without uploads when none are set", async () => {
        configureQuard({ origins: { user: { trust: "untrusted" } } });

        expect(getConfig().origins).toEqual({ user: { trust: "untrusted" } });
        expect(uploaders).toHaveLength(0);
        expect(await flushUploads()).toBe(true);
    });

    it("starts uploads once key and webhook URL are set", async () => {
        configureQuard(SETTINGS);

        expect(uploaders).toHaveLength(1);
        expect(uploaders[0]?.options).toMatchObject({ key: "qk_live_abc", webhookUrl: "http://webhook.test" });
        expect(uploaders[0]?.start).toHaveBeenCalled();
        expect(await flushUploads()).toBe(true);
        expect(uploaders[0]?.flush).toHaveBeenCalled();
    });

    it("says whether uploads are on, and stores no label records while they are off", async () => {
        expect(uploadsOn()).toBe(false);
        expect(await sendLabels([])).toBe(false);

        configureQuard(SETTINGS);

        expect(uploadsOn()).toBe(true);
    });

    it("keeps the same uploader when other settings change, and replaces it when uploads change", () => {
        configureQuard(SETTINGS);
        configureQuard({ onEvent: () => {} });
        expect(uploaders).toHaveLength(1);

        configureQuard({ key: "qk_live_other" });
        expect(uploaders).toHaveLength(2);
        expect(uploaders[0]?.stop).toHaveBeenCalled();

        configureQuard({ key: undefined, webhookUrl: undefined });
        expect(uploaders[1]?.stop).toHaveBeenCalled();
    });

    it.each([
        ["a webhook URL without a key", { webhookUrl: "http://w" }, "need key together with webhookUrl or controlUrl"],
        ["a key with nowhere to send", { key: "k" }, "webhookUrl or controlUrl"],
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

    it("starts the link to control once key and control URL are set", () => {
        configureQuard(LINKED);

        expect(uploaders).toHaveLength(0);
        expect(controls).toHaveLength(1);
        expect(controls[0]?.options).toEqual({ url: "wss://control.test/v1/connect", key: "qk_live_abc" });
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

    it("hands the uploader webhook's key for the project, asked for with the agent key", async () => {
        const fetch = webhookAnswers();
        configureQuard(SETTINGS);

        const redactor = await (uploaders[0]?.options as Redactors).redactor();

        expect(redactor).toBeDefined();
        expect(projectKey()).toEqual(PROJECT_KEY);
        expect(fetch).toHaveBeenCalledWith(
            "http://webhook.test/v1/hash-key",
            expect.objectContaining({ method: "GET" }),
        );
    });

    it("stores label records only once the project's key is known", async () => {
        webhookAnswers();
        configureQuard(SETTINGS);
        const record = {
            kind: "memory" as const,
            store: "notes",
            print: "a".repeat(64),
            runId: "b".repeat(32),
            agent: "a",
            label: { trust: "trusted" as const, sensitivity: "internal" as const, origins: [], flagged: false },
            values: [],
        };

        expect(await sendLabels([record])).toBe(false);
        learnProjectKey(PROJECT_KEY_TEXT);
        expect(await sendLabels([record])).toBe(true);
    });

    it("forgets the project's key when the agent key changes, and stops asking the old webhook", async () => {
        webhookAnswers();
        configureQuard(SETTINGS);
        const old = uploaders[0]?.options as Redactors;
        learnProjectKey(PROJECT_KEY_TEXT);

        configureQuard({ onEvent: () => {}, controlUrl: "http://control.test" });
        expect(projectKey()).toEqual(PROJECT_KEY);

        configureQuard({ key: "qk_live_other" });
        expect(projectKey()).toBeUndefined();
        expect(await old.redactor()).toBeUndefined();
        expect(projectKey()).toBeUndefined();
    });
});
