import { startTestDb, type TestDb } from "@quard/db/testing";
import { LABELS_PATH } from "@quard/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../webhook/app.ts";
import { openClient, type Client } from "../test/client.ts";
import { newProject, type TestProject } from "../test/context.ts";
import { memoryRecord, messageRecord, PRINT, REF } from "../test/labels.ts";
import { KEYS, lookupMessage, runCountMessage } from "../test/messages.ts";
import { startTestControl, type TestControl } from "../test/server.ts";

// A sender stores label records through webhook; a receiver in another
// process looks them up through control over a real WebSocket

const SECRET = "sk-proj-abcdefghijklmnopqrstuvwx";

let test: TestDb;
let control: TestControl;
let project: TestProject;
let receiver: Client;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

beforeEach(async () => {
    project = await newProject(test.db);
    control = await startTestControl(test);
    receiver = await openClient(control.port, project.key);
    await receiver.hello();
});

afterEach(async () => {
    await receiver.close();
    await control.close();
});

afterAll(async () => {
    await test.stop();
});

async function storeThroughWebhook(key: string, records: unknown[]): Promise<Response> {
    const webhook = createApp({ db: test.db, keys: KEYS });
    return webhook.request(LABELS_PATH, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ records }),
    });
}

describe("label records across processes", { timeout: 30_000 }, () => {
    it("finds a message's record as soon as webhook answered", async () => {
        const sent = messageRecord({ label: { ...messageRecord().label, origins: [`web:acme.com/?key=${SECRET}`] } });

        const stored = await storeThroughWebhook(project.key, [sent]);
        expect(stored.status).toBe(201);
        const ask = lookupMessage({ kind: "message", ref: REF });
        receiver.send(ask);
        const answer = await receiver.next("labels");

        const clean = { ...sent, label: { ...sent.label, origins: ["web:acme.com/?key=sk-proj-…"] } };
        expect(answer).toEqual({ type: "labels", id: ask.id, records: [clean] });
    });

    it("reads memory labels back, and nothing from another project", async () => {
        const other = await newProject(test.db, "Other");
        const written = memoryRecord();
        await storeThroughWebhook(project.key, [written]);
        await storeThroughWebhook(other.key, [messageRecord()]);

        const memory = lookupMessage({ kind: "memory", print: PRINT });
        const message = lookupMessage({ kind: "message", ref: REF });
        receiver.send(memory);
        receiver.send(message);

        expect(await receiver.next("labels", (answer) => answer.id === memory.id)).toMatchObject({
            records: [written],
        });
        expect(await receiver.next("labels", (answer) => answer.id === message.id)).toMatchObject({ records: [] });
    });

    it("shares a run's counters between two processes", async () => {
        const sender = await openClient(control.port, project.key);
        await sender.hello();
        const pay = (amount: number) =>
            runCountMessage([
                { counter: "calls:payInvoice", add: 1, max: 5 },
                { counter: "amount:payInvoice:amount", add: amount, max: 1000 },
            ]);
        const first = pay(600);
        const second = pay(300);
        const third = pay(200);

        sender.send(first);
        expect(await sender.next("run_counted")).toEqual({
            type: "run_counted",
            id: first.id,
            ok: true,
            used: [1, 600],
        });
        receiver.send(second);
        expect(await receiver.next("run_counted")).toEqual({
            type: "run_counted",
            id: second.id,
            ok: true,
            used: [2, 900],
        });
        // The amount would pass its cap, so the call is not counted either
        sender.send(third);
        expect(await sender.next("run_counted")).toEqual({
            type: "run_counted",
            id: third.id,
            ok: false,
            used: [2, 900],
        });
        await sender.close();
    });
});
