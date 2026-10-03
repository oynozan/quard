import { createRedactor, labelUpload, parseHashKey, type LabelRecord, type MessageRecord } from "@quard/shared";
import { describe, expect, it } from "vitest";
import { createLabelSender } from "./label-sender.ts";
import type { Send } from "./uploader.ts";

const redactor = createRedactor(parseHashKey("ab".repeat(32)));

function messageRecord(ref: string, origins = ["web:evil.com"]): MessageRecord {
    return {
        kind: "message",
        ref,
        runId: "b".repeat(32),
        sender: "orchestrator",
        depth: 0,
        print: "c".repeat(64),
        label: { trust: "untrusted", sensitivity: "public", origins, flagged: false },
        values: [],
    };
}

type Sent = { url: string; init: RequestInit; records: LabelRecord[] };

// A webhook stand-in that answers with the given statuses in turn
function webhook(...statuses: Array<number | "down" | "silent">) {
    const sent: Sent[] = [];
    const send: Send = async (url, init) => {
        sent.push({ url, init, records: labelUpload.parse(JSON.parse(String(init.body))).records });
        const status = statuses.length > 1 ? statuses.shift() : statuses[0];
        if (status === "down") {
            throw new Error("connection refused");
        }
        if (status === "silent") {
            // Never answers, so only the timeout ends the wait
            return new Promise((_resolve, reject) =>
                init.signal?.addEventListener("abort", () => reject(new Error("x"))),
            );
        }
        return new Response("{}", { status: status ?? 201 });
    };
    return { sent, send };
}

function sender(send: Send, timeoutMs?: number) {
    return createLabelSender({ webhookUrl: "http://webhook.test/", key: "qk_live_abc", redactor, send, timeoutMs });
}

describe("createLabelSender", () => {
    it("posts the records with the agent key and is true once webhook stored them", async () => {
        const { sent, send } = webhook(201);

        expect(await sender(send)([messageRecord("a".repeat(16))])).toBe(true);
        expect(sent).toHaveLength(1);
        expect(sent[0]?.url).toBe("http://webhook.test/v1/labels");
        expect(sent[0]?.init).toMatchObject({
            method: "POST",
            headers: { authorization: "Bearer qk_live_abc", "content-type": "application/json" },
        });
        expect(sent[0]?.records).toEqual([messageRecord("a".repeat(16))]);
    });

    it("masks emails in what it sends", async () => {
        const { sent, send } = webhook(201);

        await sender(send)([messageRecord("a".repeat(16), ["email:bob@acme.com"])]);

        expect(sent[0]?.records[0]?.label.origins).toEqual(["email:b…@acme.com"]);
    });

    it("masks names in memory records and tool lists, and never touches hashes", async () => {
        const { sent, send } = webhook(201);
        // Holds a digit run that passes the card check
        const print = `a4111111111111111${"b".repeat(47)}`;
        const memory: LabelRecord = {
            kind: "memory",
            store: "notes of bob@acme.com",
            print,
            runId: "b".repeat(32),
            agent: "agent bob@acme.com",
            label: { trust: "trusted", sensitivity: "internal", origins: [], flagged: false },
            values: [
                {
                    hash: "d".repeat(32),
                    origin: "email:bob@acme.com",
                    trust: "untrusted",
                    sensitivity: "public",
                    flags: ["bob@acme.com"],
                    stepId: "1".repeat(16),
                },
            ],
        };

        await sender(send)([memory, { ...messageRecord("a".repeat(16)), print, tools: ["mail bob@acme.com"] }]);

        expect(sent[0]?.records).toMatchObject([
            {
                store: "notes of b…@acme.com",
                agent: "agent b…@acme.com",
                print,
                values: [{ hash: "d".repeat(32), origin: "email:b…@acme.com", flags: ["b…@acme.com"] }],
            },
            { print, tools: ["mail b…@acme.com"] },
        ]);
    });

    it.each([200, 202, 400, 500])("is false when webhook answers %i", async (status) => {
        expect(await sender(webhook(status).send)([messageRecord("a".repeat(16))])).toBe(false);
    });

    it("is false when webhook can't be reached or does not answer in time", async () => {
        expect(await sender(webhook("down").send)([messageRecord("a".repeat(16))])).toBe(false);
        expect(await sender(webhook("silent").send, 20)([messageRecord("a".repeat(16))])).toBe(false);
    });

    it("sends at most 100 records at a time and stops at the first failure", async () => {
        const records = Array.from({ length: 250 }, (_, n) => messageRecord(n.toString(16).padStart(16, "0")));
        const stored = webhook(201);
        const refused = webhook(201, 500);

        expect(await sender(stored.send)(records)).toBe(true);
        expect(stored.sent.map((request) => request.records.length)).toEqual([100, 100, 50]);
        expect(await sender(refused.send)(records)).toBe(false);
        expect(refused.sent).toHaveLength(2);
    });

    it("sends nothing for no records, or for records webhook would refuse", async () => {
        const { sent, send } = webhook(201);

        expect(await sender(send)([])).toBe(true);
        expect(await sender(send)([{ ...messageRecord("a".repeat(16)), sender: "" }])).toBe(false);
        expect(sent).toEqual([]);
    });

    it("uses fetch when no send function is given", async () => {
        const store = createLabelSender({ webhookUrl: "http://127.0.0.1:9", key: "k", redactor, timeoutMs: 2000 });

        expect(await store([messageRecord("a".repeat(16))])).toBe(false);
    });
});
