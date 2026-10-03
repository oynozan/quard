import type { ContentEvent, ModelCallEvent, ToolCallEvent } from "@quard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../connect/connect.ts";
import { item } from "../../test/events.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { ingestBatch } from "../ingest/store.ts";
import { createProject } from "../projects.ts";
import { findValue } from "./values.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const run = (n: number) => n.toString(16).padStart(32, "0");
const step = (n: number) => n.toString(16).padStart(16, "0");
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 3, 12, 0, seconds));

const IBAN = `iban:DE89…3000#${"f".repeat(32)}`;
const URL = "url:https://pay.acme.com/invoices/inv-1";
const HOST = "host:pay.acme.com";
const DOMAIN = "domain:acme.com";

const WEB = { origin: "web:acme-billing.net", trust: "untrusted", sensitivity: "public" } as const;
const CRM = { origin: "mcp:crm", trust: "trusted", sensitivity: "internal" } as const;

const model = (runId: string, stepId: string, seconds: number): ModelCallEvent => ({
    type: "model_call",
    runId,
    stepId,
    agent: "billing",
    at: at(seconds).toISOString(),
    model: "gpt-5.4-mini",
    toolCalls: [],
    status: "ok",
    durationMs: 500,
});

const read = (
    runId: string,
    stepId: string,
    contentId: string,
    seconds: number,
    keys: string[],
    label: { origin: string; trust: "trusted" | "untrusted"; sensitivity: "internal" | "public" } = WEB,
): ContentEvent => ({
    type: "content",
    runId,
    stepId,
    agent: "billing",
    at: at(seconds).toISOString(),
    contentId,
    ...label,
    flags: [],
    keys,
});

const call = (runId: string, stepId: string, seconds: number, keys: string[]): ToolCallEvent => ({
    type: "tool_call",
    runId,
    stepId,
    agent: "researcher",
    at: at(seconds).toISOString(),
    tool: "payInvoice",
    callId: "call_1",
    arguments: { iban: "DE89…3000", amount: 4950 },
    status: "ok",
    influenced: true,
    flagged: false,
    durationMs: 3,
    keys,
});

const store = async (projectId: string, events: (ContentEvent | ModelCallEvent | ToolCallEvent)[]) => {
    await ingestBatch(
        test.db,
        projectId,
        events.map((event) => item(event)),
    );
};

describe("findValue", () => {
    it("finds nothing without keys, without reading the database", async () => {
        expect(await findValue({} as Db, "project", [], { limit: 50 })).toEqual({ total: 0, runs: 0, matches: [] });
    });

    it("finds nothing in a new project", async () => {
        const projectId = await createProject(test.db, "Acme");

        expect(await findValue(test.db, projectId, [IBAN], { limit: 50 })).toEqual({ total: 0, runs: 0, matches: [] });
    });

    it("finds content a model read, with its step and label", async () => {
        const projectId = await createProject(test.db, "Acme");
        await store(projectId, [read(run(1), step(1), "c1", 0, [IBAN]), model(run(1), step(1), 1)]);

        expect(await findValue(test.db, projectId, [IBAN], { limit: 50 })).toEqual({
            total: 1,
            runs: 1,
            matches: [
                {
                    source: "content",
                    runId: run(1),
                    stepId: step(1),
                    agent: "billing",
                    at: at(0),
                    matched: [IBAN],
                    stepKind: "model_call",
                    stepName: "gpt-5.4-mini",
                    label: WEB,
                },
            ],
        });
    });

    it("finds a tool's output, and content whose step has not arrived", async () => {
        const projectId = await createProject(test.db, "Acme");
        await store(projectId, [
            call(run(1), step(2), 2, []),
            read(run(1), step(2), "c2", 3, [IBAN], CRM),
            read(run(1), step(3), "c3", 4, [IBAN]),
        ]);

        const { matches } = await findValue(test.db, projectId, [IBAN], { limit: 50 });

        expect(matches).toMatchObject([
            { source: "content", stepId: step(3), stepKind: null, stepName: null, label: WEB },
            { source: "content", stepId: step(2), stepKind: "tool_call", stepName: "payInvoice", label: CRM },
        ]);
    });

    it("finds a call's arguments, with the earliest content that held the value before it", async () => {
        const projectId = await createProject(test.db, "Acme");
        await store(projectId, [
            read(run(2), step(9), "c1", 0, [IBAN], CRM),
            read(run(1), step(1), "c1", 1, [IBAN]),
            read(run(1), step(1), "c2", 1, [IBAN], CRM),
            read(run(1), step(4), "c3", 3, [IBAN], CRM),
            call(run(1), step(2), 2, [IBAN]),
        ]);

        const { matches } = await findValue(test.db, projectId, [IBAN], { limit: 50 });

        expect(matches.find((match) => match.stepId === step(2))).toEqual({
            source: "call",
            runId: run(1),
            stepId: step(2),
            agent: "researcher",
            at: at(2),
            matched: [IBAN],
            stepName: "payInvoice",
            arguments: { iban: "DE89…3000", amount: 4950 },
            label: WEB,
        });
    });

    it("counts content read at the same moment as a call as its source", async () => {
        const projectId = await createProject(test.db, "Acme");
        await store(projectId, [read(run(1), step(1), "c1", 2, [IBAN], CRM), call(run(1), step(2), 2, [IBAN])]);

        const { matches } = await findValue(test.db, projectId, [IBAN], { limit: 50 });

        expect(matches.find((match) => match.source === "call")?.label).toEqual(CRM);
    });

    it("has no source label when nothing held the value before the call", async () => {
        const projectId = await createProject(test.db, "Acme");
        await store(projectId, [call(run(1), step(2), 2, [IBAN]), read(run(1), step(3), "c1", 3, [IBAN])]);

        const { matches } = await findValue(test.db, projectId, [IBAN], { limit: 50 });

        expect(matches).toMatchObject([
            { source: "content", stepId: step(3) },
            { source: "call", stepId: step(2), label: null },
        ]);
    });
});

describe("findValue strength and order", () => {
    it("reports the matched keys in search order, and traces a call by its first one", async () => {
        const projectId = await createProject(test.db, "Acme");
        await store(projectId, [
            read(run(1), step(1), "c1", 0, [DOMAIN]),
            read(run(1), step(2), "c2", 1, [DOMAIN, URL, HOST], CRM),
            call(run(1), step(3), 2, ["id:inv-1", DOMAIN, HOST]),
        ]);

        const { matches } = await findValue(test.db, projectId, [URL, HOST, DOMAIN], { limit: 50 });

        expect(matches.map(({ stepId, matched, label }) => ({ stepId, matched, label }))).toEqual([
            { stepId: step(3), matched: [HOST, DOMAIN], label: CRM },
            { stepId: step(2), matched: [URL, HOST, DOMAIN], label: CRM },
            { stepId: step(1), matched: [DOMAIN], label: WEB },
        ]);
        // A key given twice counts once
        expect(await findValue(test.db, projectId, [URL, HOST, HOST, DOMAIN], { limit: 50 })).toEqual(
            await findValue(test.db, projectId, [URL, HOST, DOMAIN], { limit: 50 }),
        );
    });

    it("keeps one row per step: the strongest key, then the call, then the earliest content", async () => {
        const projectId = await createProject(test.db, "Acme");
        await store(projectId, [
            // Content read by one model call
            read(run(1), step(1), "c1", 0, [DOMAIN]),
            read(run(1), step(1), "c2", 1, [HOST], CRM),
            read(run(1), step(1), "c3", 2, [HOST]),
            model(run(1), step(1), 3),
            // A call whose output holds the same key as its arguments
            call(run(1), step(2), 4, [HOST]),
            read(run(1), step(2), "c4", 5, [HOST]),
            // A call whose output holds a stronger key than its arguments
            call(run(1), step(3), 6, [DOMAIN]),
            read(run(1), step(3), "c5", 7, [URL]),
        ]);

        const result = await findValue(test.db, projectId, [URL, HOST, DOMAIN], { limit: 50 });

        expect(result).toMatchObject({ total: 3, runs: 1 });
        expect(result.matches.map(({ stepId, source, at, matched }) => ({ stepId, source, at, matched }))).toEqual([
            { stepId: step(3), source: "content", at: at(7), matched: [URL] },
            { stepId: step(2), source: "call", at: at(4), matched: [HOST] },
            { stepId: step(1), source: "content", at: at(1), matched: [HOST] },
        ]);
    });

    it("lists the newest matches first, and counts them all", async () => {
        const projectId = await createProject(test.db, "Acme");
        await store(projectId, [
            read(run(1), step(1), "c1", 0, [IBAN]),
            read(run(2), step(1), "c1", 10, [IBAN]),
            read(run(2), step(2), "c2", 20, [IBAN]),
            read(run(3), step(1), "c1", 30, ["iban:GB33…5555#" + "e".repeat(32)]),
            call(run(3), step(2), 40, []),
        ]);

        const result = await findValue(test.db, projectId, [IBAN], { limit: 2 });

        expect(result.total).toBe(3);
        expect(result.runs).toBe(2);
        expect(result.matches.map(({ runId, stepId }) => [runId, stepId])).toEqual([
            [run(2), step(2)],
            [run(2), step(1)],
        ]);
    });

    it("leaves out other projects", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        await store(other, [read(run(1), step(1), "c1", 0, [IBAN]), call(run(1), step(2), 1, [IBAN])]);
        await store(projectId, [call(run(1), step(2), 2, [IBAN])]);

        const result = await findValue(test.db, projectId, [IBAN], { limit: 50 });

        expect(result).toMatchObject({ total: 1, runs: 1, matches: [{ source: "call", label: null }] });
        expect((await findValue(test.db, other, [IBAN], { limit: 50 })).total).toBe(2);
    });
});
