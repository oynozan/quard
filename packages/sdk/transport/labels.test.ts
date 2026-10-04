import type { LabelRecord, MemoryRecord } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectKey } from "../core/project-key.ts";
import { CONTROL_KEY, startControlServer, type ControlServer } from "../test/control-server.ts";
import { PROJECT_KEY } from "../test/hash-key.ts";
import { resetAll } from "../test/reset.ts";
import { startWebhookServer, WEBHOOK_KEY, type WebhookServer } from "../test/webhook-server.ts";
import { configureQuard, waitForHashKey } from "./configure.ts";
import { lookupLabels, storeLabels, waitForKey } from "./labels.ts";
import { activeControl, setActiveControl } from "./link/active.ts";
import { createControl } from "./link/control.ts";
import { controlSocketUrl } from "./link/url.ts";

const REF = "c".repeat(16);

const memory: MemoryRecord = {
    kind: "memory",
    store: "notes",
    print: "a".repeat(64),
    runId: "b".repeat(32),
    agent: "a",
    label: { trust: "trusted", sensitivity: "internal", origins: [], flagged: false },
    values: [],
};

const message: LabelRecord = {
    kind: "message",
    ref: REF,
    runId: "b".repeat(32),
    sender: "orchestrator",
    depth: 0,
    print: "d".repeat(64),
    label: { trust: "untrusted", sensitivity: "public", origins: ["web:evil.com"], flagged: false },
    values: [],
};

let labels: LabelRecord[];
let webhook: WebhookServer;
let control: ControlServer;

beforeEach(async () => {
    labels = [];
    webhook = await startWebhookServer(labels);
    control = await startControlServer(CONTROL_KEY, labels);
});

afterEach(async () => {
    resetAll();
    await webhook.close();
    await control.close();
});

describe("storeLabels", () => {
    it("stores nothing without uploads, and has nothing to do for no records", async () => {
        expect(await storeLabels([])).toBe(true);
        expect(await storeLabels([memory])).toBe(false);
    });

    it("stores records in webhook once uploads are on and the key is known", async () => {
        configureQuard({ key: WEBHOOK_KEY, webhookUrl: webhook.url });

        expect(await storeLabels([memory])).toBe(false);
        expect(await waitForKey()).toBe(true);
        expect(await storeLabels([memory, message])).toBe(true);
        expect(labels).toEqual([memory, message]);
    });

    it("is false when webhook refuses the records", async () => {
        configureQuard({ key: WEBHOOK_KEY, webhookUrl: webhook.url });
        await waitForKey();
        webhook.state.labelStatus = 503;

        expect(await storeLabels([memory])).toBe(false);
        expect(labels).toEqual([]);
    });
});

describe("lookupLabels", () => {
    it("finds nothing without a control link", async () => {
        expect(await lookupLabels({ kind: "message", ref: REF })).toBeUndefined();
    });

    it("asks control for the records behind a reference or a print", async () => {
        labels.push(message, memory);
        configureQuard({ key: CONTROL_KEY, controlUrl: control.url });

        // Asked before the link is up: the lookup waits for it
        expect(await lookupLabels({ kind: "message", ref: REF })).toEqual([message]);
        expect(await lookupLabels({ kind: "memory", print: memory.print })).toEqual([memory]);
        expect(await lookupLabels({ kind: "message", ref: "e".repeat(16) })).toEqual([]);
    });

    it("is undefined when control does not answer in time", async () => {
        control.state.answerLookups = false;
        const link = createControl({
            url: controlSocketUrl(control.url),
            key: CONTROL_KEY,
            timing: { replyMs: 50 },
        });
        setActiveControl(link);
        await vi.waitFor(() => expect(activeControl()?.link.ready()).toBe(true));

        expect(await lookupLabels({ kind: "message", ref: REF })).toBeUndefined();
        link.stop();
    });
});

describe("waitForKey", () => {
    it("has nothing to wait for without a backend", async () => {
        expect(await waitForKey()).toBeUndefined();
        expect(projectKey()).toBeUndefined();
    });

    it("gets the project's key from webhook with the agent key", async () => {
        configureQuard({ key: WEBHOOK_KEY, webhookUrl: webhook.url });

        expect(await waitForKey()).toBe(true);
        expect(await waitForKey()).toBe(true);

        expect(projectKey()).toEqual(PROJECT_KEY);
        expect(webhook.state.keyRequests).toBe(1);
    });

    it("gives up at once when webhook refuses and nothing else can bring the key", async () => {
        configureQuard({ key: "qk_live_wrong", webhookUrl: webhook.url });
        const start = Date.now();

        expect(await waitForKey()).toBe(false);
        expect(Date.now() - start).toBeLessThan(2000);
    });

    it("gets the key from control's ready message", async () => {
        configureQuard({ key: CONTROL_KEY, controlUrl: control.url });

        expect(await waitForKey()).toBe(true);
        expect(projectKey()).toEqual(PROJECT_KEY);
    });

    it("waits for control while webhook can't hand out the key", async () => {
        const down = await startWebhookServer([], CONTROL_KEY);
        down.state.keyStatus = 503;
        configureQuard({ key: CONTROL_KEY, webhookUrl: down.url, controlUrl: control.url });

        expect(await waitForKey()).toBe(true);
        expect(down.state.keyRequests).toBe(1);
        expect(projectKey()).toEqual(PROJECT_KEY);
        await down.close();
    });

    it("gives up when no backend hands out the key in time", async () => {
        configureQuard({ key: "qk_live_wrong", controlUrl: control.url });

        expect(await waitForHashKey(50)).toBe(false);
    });
});
