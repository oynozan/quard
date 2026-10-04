import { keyedHash, type RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guard, quard } from "../index.ts";
import { CONTROL_KEY, startControlServer, type ControlServer } from "../test/control-server.ts";
import { PROJECT_KEY, projectKeyOf } from "../test/hash-key.ts";
import { resetAll } from "../test/reset.ts";
import { startWebhookServer, WEBHOOK_KEY, type WebhookServer } from "../test/webhook-server.ts";
import { flushUploads } from "../transport/configure.ts";

// An agent never sets a hash key: webhook and control hand out its
// project's key to its agent key, and nothing leaves the process unhashed
// before the key is there

const IBAN = "DE89370400440532013000";

let webhook: WebhookServer;
let control: ControlServer;

beforeEach(async () => {
    webhook = await startWebhookServer();
    control = await startControlServer();
});

afterEach(async () => {
    resetAll();
    vi.restoreAllMocks();
    await webhook.close();
    await control.close();
});

function hashedIban(key: Buffer): string {
    return `iban:DE89…3000#${keyedHash(key, "iban", IBAN)}`;
}

function toolCalls(server: WebhookServer): Array<Extract<RunEvent, { type: "tool_call" }>> {
    return server.events.filter((event) => event.type === "tool_call");
}

const payInvoice = () => guard(async (_input: { iban: string }) => "paid", { type: "limit", name: "payInvoice" });

describe("an agent's uploads", () => {
    it("are hashed with the key webhook hands out to its agent key", async () => {
        quard.configure({ key: WEBHOOK_KEY, webhookUrl: webhook.url });

        await quard.run({}, () => payInvoice()({ iban: IBAN }));

        expect(await flushUploads()).toBe(true);
        expect(webhook.state.keyRequests).toBe(1);
        expect(toolCalls(webhook)[0]?.keys).toContain(hashedIban(PROJECT_KEY));
        expect(JSON.stringify(webhook.events)).not.toContain(IBAN);
    });

    it("hash the same IBAN apart in another project", async () => {
        const other = await startWebhookServer([], WEBHOOK_KEY, "project-other");
        quard.configure({ key: WEBHOOK_KEY, webhookUrl: other.url });

        await quard.run({}, () => payInvoice()({ iban: IBAN }));
        await flushUploads();

        const otherKey = Buffer.from(projectKeyOf("project-other"), "hex");
        expect(toolCalls(other)[0]?.keys).toContain(hashedIban(otherKey));
        expect(toolCalls(other)[0]?.keys).not.toContain(hashedIban(PROJECT_KEY));
        await other.close();
    });

    it("stay in the process while webhook can't hand out the key, then go out hashed", async () => {
        webhook.state.keyStatus = 503;
        quard.configure({ key: WEBHOOK_KEY, webhookUrl: webhook.url });
        await quard.run({}, () => payInvoice()({ iban: IBAN }));

        expect(await flushUploads()).toBe(false);
        expect(webhook.events).toEqual([]);

        webhook.state.keyStatus = 200;
        expect(await flushUploads()).toBe(true);
        expect(toolCalls(webhook)[0]?.keys).toContain(hashedIban(PROJECT_KEY));
    });

    it("never leave with an agent key webhook refuses, and the app is told once", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        quard.configure({ key: "qk_live_revoked", webhookUrl: webhook.url });
        await quard.run({}, () => payInvoice()({ iban: IBAN }));

        expect(await flushUploads()).toBe(false);
        expect(await flushUploads()).toBe(false);

        expect(webhook.events).toEqual([]);
        expect(warn.mock.calls).toEqual([[expect.stringContaining("refused to hand out the hash key (401)")]]);
    });
});

describe("an agent linked to control", () => {
    it("reports watched values hashed with the key from control's ready message", async () => {
        quard.configure({ key: CONTROL_KEY, controlUrl: control.url });
        const pay = guard(async (_input: { iban: string }) => "paid", {
            type: "limit",
            name: "payInvoice",
            fleetCheck: ["iban"],
        });

        expect(await pay({ iban: IBAN })).toBe("paid");
        const report = await control.waitFor("fleet");

        expect(report.values).toEqual([{ field: "iban", kind: "iban", key: hashedIban(PROJECT_KEY) }]);
    });
});
