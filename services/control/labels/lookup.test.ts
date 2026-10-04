import { storeLabelRecords } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newProject, readyConnection, testContext } from "../test/context.ts";
import { memoryRecord, messageRecord, PRINT, REF } from "../test/labels.ts";
import { lookupMessage } from "../test/messages.ts";
import { lookup } from "./lookup.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("lookup", () => {
    it("answers with the record behind a message's reference", async () => {
        const project = await newProject(test.db);
        const ctx = testContext(test.db);
        const { connection, socket } = await readyConnection(ctx, project);
        await storeLabelRecords(test.db, project.projectId, [messageRecord()]);
        const message = lookupMessage({ kind: "message", ref: REF });

        await lookup(ctx, connection, message);

        expect(socket.of("labels")).toEqual([{ type: "labels", id: message.id, records: [messageRecord()] }]);
    });

    it("answers with a memory item's labels merged to the least trusted", async () => {
        const project = await newProject(test.db);
        const ctx = testContext(test.db);
        const { connection, socket } = await readyConnection(ctx, project);
        const trusted = memoryRecord();
        const untrusted = memoryRecord({ label: { ...trusted.label, trust: "untrusted" } });
        await storeLabelRecords(test.db, project.projectId, [trusted, untrusted]);

        await lookup(ctx, connection, lookupMessage({ kind: "memory", print: PRINT }));

        expect(socket.of("labels")[0]?.records).toMatchObject([
            { kind: "memory", print: PRINT, label: { trust: "untrusted" } },
        ]);
    });

    it("answers with no records for an unknown target or one in another project", async () => {
        const project = await newProject(test.db);
        const other = await newProject(test.db, "Other");
        const ctx = testContext(test.db);
        const { connection, socket } = await readyConnection(ctx, project);
        await storeLabelRecords(test.db, other.projectId, [messageRecord(), memoryRecord()]);

        await lookup(ctx, connection, lookupMessage({ kind: "message", ref: REF }));
        await lookup(ctx, connection, lookupMessage({ kind: "memory", print: PRINT }));

        expect(socket.of("labels").map((answer) => answer.records)).toEqual([[], []]);
    });
});
