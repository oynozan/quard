import type { ClientMessage, LabelRecord, RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { guard, quard } from "../index.ts";
import { CONTROL_KEY, startControlServer, type ControlServer } from "../test/control-server.ts";
import { resetAll } from "../test/reset.ts";
import { startWebhookServer, type WebhookServer } from "../test/webhook-server.ts";
import { flushUploads } from "../transport/configure.ts";

// Guarded tools called with values JSON can't hold, such as a BigInt or
// an object inside itself. Webhook and control still get everything.

const HASH_KEY = "ab".repeat(32);

let control: ControlServer;
let webhook: WebhookServer;

beforeEach(async () => {
    const labels: LabelRecord[] = [];
    control = await startControlServer(CONTROL_KEY, labels);
    webhook = await startWebhookServer(labels, CONTROL_KEY);
});

afterEach(async () => {
    resetAll();
    await control.close();
    await webhook.close();
});

function connect(withControl = false): void {
    quard.configure({
        key: CONTROL_KEY,
        webhookUrl: webhook.url,
        hashKey: HASH_KEY,
        ...(withControl ? { controlUrl: control.url } : {}),
    });
}

function toolCalls(): Array<Extract<RunEvent, { type: "tool_call" }>> {
    return webhook.events.filter((event) => event.type === "tool_call");
}

function sent<T extends ClientMessage["type"]>(type: T): Array<Extract<ClientMessage, { type: T }>> {
    return control.received.filter((message): message is Extract<ClientMessage, { type: T }> => message.type === type);
}

type Invoice = { amount: number; self?: Invoice };

// An invoice whose own field points back at it
function circularInvoice(): Invoice {
    const invoice: Invoice = { amount: 5 };
    invoice.self = invoice;
    return invoice;
}

type HtmlNode = { id: string; parent?: HtmlNode; prev?: HtmlNode; next?: HtmlNode; children: HtmlNode[] };

// A table whose nodes know their parent and their siblings, as parsed HTML does
function linkedTable(size: number): HtmlNode {
    const table: HtmlNode = { id: "table", children: [] };
    const add = (parent: HtmlNode): HtmlNode[] => {
        for (let at = 0; at < size; at++) {
            const prev = parent.children.at(-1);
            const node: HtmlNode = { id: `${parent.id}.${at}`, parent, prev, children: [] };
            if (prev !== undefined) {
                prev.next = node;
            }
            parent.children.push(node);
        }
        return parent.children;
    };
    for (const row of add(table)) {
        add(row);
    }
    return table;
}

describe("a guarded tool called with values JSON can't hold", () => {
    it("uploads a BigInt as its digits, and every event after it", async () => {
        connect();
        const pay = guard(async (input: { amount: bigint | number }) => `paid ${input.amount}`, {
            type: "limit",
            name: "pay",
        });

        expect(await quard.run({}, () => pay({ amount: 10n }))).toBe("paid 10");
        expect(await flushUploads()).toBe(true);
        expect(await quard.run({}, () => pay({ amount: 20 }))).toBe("paid 20");
        expect(await flushUploads()).toBe(true);

        expect(toolCalls().map((event) => event.arguments)).toEqual([{ amount: "10" }, { amount: 20 }]);
        expect(webhook.events.filter((event) => event.type === "run_finished")).toHaveLength(2);
    });

    it("masks a card number sent as a BigInt", async () => {
        connect();
        const charge = guard(async (_input: { card: bigint }) => "charged", { type: "limit", name: "charge" });

        await quard.run({}, () => charge({ card: 4111111111111111n }));
        expect(await flushUploads()).toBe(true);

        expect(toolCalls().map((event) => event.arguments)).toEqual([{ card: "4111…1111" }]);
        expect(JSON.stringify(webhook.events)).not.toContain("4111111111111111");
    });

    it("cuts a circular argument where it repeats, and uploads every event after it", async () => {
        connect();
        const save = guard(async (_input: unknown) => "saved", { type: "limit", name: "save" });

        expect(await quard.run({}, () => save(circularInvoice()))).toBe("saved");
        expect(await flushUploads()).toBe(true);
        expect(await quard.run({}, () => save({ amount: 6 }))).toBe("saved");
        expect(await flushUploads()).toBe(true);

        expect(toolCalls().map((event) => event.arguments)).toEqual([{ amount: 5, self: "…" }, { amount: 6 }]);
    });

    it("uploads at once a table whose nodes link to each other, each node once", async () => {
        connect();
        const save = guard(async (_input: unknown) => "saved", { type: "limit", name: "save" });

        expect(await quard.run({}, () => save(linkedTable(30)))).toBe("saved");
        const start = performance.now();
        expect(await flushUploads()).toBe(true);

        expect(performance.now() - start).toBeLessThan(1_000);
        const ids = JSON.stringify(toolCalls()[0]?.arguments).match(/"id":"[^"]*"/g) ?? [];
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.length).toBeGreaterThan(800);
    });

    it("asks and counts through control with them, and uploads every event", async () => {
        connect(true);
        control.state.autoAnswer = "once";
        const pay = guard(
            async (input: { amount: unknown }) => `paid ${String(input.amount)}`,
            [
                { type: "approval", name: "pay" },
                { type: "limit", maxAmountPerDay: { field: "amount", max: 1000 } },
            ],
        );

        expect(await quard.run({}, () => pay({ amount: 10n }))).toBe("paid 10");
        expect(await quard.run({}, () => pay(circularInvoice()))).toBe("paid 5");
        expect(await flushUploads()).toBe(true);

        expect(sent("ask").map((ask) => ask.args)).toEqual([{ amount: "10n" }, { amount: 5, self: "[seen]" }]);
        expect(sent("count").flatMap((count) => count.counts.map((item) => item.add))).toEqual([10, 5]);
        expect(toolCalls().map((event) => event.arguments)).toEqual([{ amount: "10" }, { amount: 5, self: "…" }]);
    });
});
