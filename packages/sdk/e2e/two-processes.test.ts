import { spawn } from "node:child_process";
import { join } from "node:path";
import type { LabelRecord, RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTROL_KEY, startControlServer, type ControlServer } from "../test/control-server.ts";
import { startWebhookServer, type WebhookServer } from "../test/webhook-server.ts";

// The M4 finish line with real processes: an orchestrator in one
// delegates to a billing agent in another, through webhook and control.

const APP = join(import.meta.dirname, "..", "test", "fixtures", "agent-process.ts");

let control: ControlServer;
let webhook: WebhookServer;

beforeEach(async () => {
    // What webhook stores, control finds
    const labels: LabelRecord[] = [];
    control = await startControlServer(CONTROL_KEY, labels);
    webhook = await startWebhookServer(labels, CONTROL_KEY);
});

afterEach(async () => {
    await control.close();
    await webhook.close();
});

// Runs one agent process, and stops it when it is still alive after 10 s
function runAgent(env: Record<string, string>): Promise<{ code: number | null; output: string }> {
    const child = spawn(process.execPath, [APP], {
        env: {
            ...process.env,
            QUARD_TEST_KEY: CONTROL_KEY,
            QUARD_TEST_WEBHOOK_URL: webhook.url,
            QUARD_TEST_CONTROL_URL: control.url,
            ...env,
        },
        stdio: ["ignore", "pipe", "pipe"],
    });
    const stuck = setTimeout(() => child.kill(), 10_000);
    let output = "";
    child.stdout.on("data", (data) => (output += String(data)));
    child.stderr.on("data", (data) => (output += String(data)));
    return new Promise((resolve) =>
        child.on("exit", (code) => {
            clearTimeout(stuck);
            resolve({ code, output });
        }),
    );
}

async function delegate(source: "web" | "supplier"): Promise<{ sent: string; paid: string }> {
    const sender = await runAgent({ QUARD_TEST_MODE: "send", QUARD_TEST_SOURCE: source });
    expect(sender.code).toBe(0);
    const receiver = await runAgent({ QUARD_TEST_MODE: "receive", QUARD_TEST_MESSAGE: sender.output.trim() });
    expect(receiver.code).toBe(0);
    return { sent: sender.output, paid: receiver.output.trim() };
}

function ofType<T extends RunEvent["type"]>(type: T): Array<Extract<RunEvent, { type: T }>> {
    return webhook.events.filter((event): event is Extract<RunEvent, { type: T }> => event.type === type);
}

describe("a run that spans two processes", () => {
    it("blocks a web-derived IBAN in the second agent's payment", { timeout: 30_000 }, async () => {
        const { sent, paid } = await delegate("web");

        expect(paid).toBe("blocked");
        expect(JSON.parse(sent).baggage).toMatch(/^quard-run=[0-9a-f]{32},quard-parent=[0-9a-f]{16},quard-labels=/);
        // The record left without the raw IBAN
        expect(JSON.stringify(webhook.labels)).not.toContain("DE89");
        await vi.waitFor(() => expect(ofType("decision").some((event) => event.guard === "action")).toBe(true));
        expect(ofType("message")).toMatchObject([
            { agent: "billing", from: "orchestrator", verified: true, trust: "untrusted", sensitivity: "public" },
        ]);
        expect(ofType("decision").find((event) => event.guard === "action")).toMatchObject({
            agent: "billing",
            decision: "block",
            reason: "value_not_from_allowed_origin",
        });
        // Both agents' events land in one run, with no content id used twice
        expect(new Set(webhook.events.map((event) => ("runId" in event ? event.runId : "")))).toHaveProperty("size", 1);
        const contentIds = ofType("content").map((event) => event.contentId);
        expect(new Set(contentIds).size).toBe(contentIds.length);
    });

    it("pays an IBAN from the supplier records, because its label travels by hash", { timeout: 30_000 }, async () => {
        const { paid } = await delegate("supplier");

        expect(paid).toBe("paid 4950");
        expect(control.received.filter((message) => message.type === "lookup")).toHaveLength(1);
    });
});
