import { createHash } from "node:crypto";
import type { Db } from "../connect/connect.ts";
import { ingestBatch } from "../queries/ingest/store.ts";
import type { StoredReplay, StoredVerdict } from "../queries/incidents/types.ts";
import { decision, item, RUN, started, STEP, TOOL_STEP } from "./events.ts";

// The id a run's incident gets
export function incidentId(projectId: string, runId = RUN): string {
    return `inc_${createHash("md5").update(`${projectId}:${runId}`).digest("hex").slice(0, 16)}`;
}

// Stores a run where a guard blocked a call, and returns its incident's id
export async function blockedRun(db: Db, projectId: string, runId = RUN, at?: string): Promise<string> {
    await ingestBatch(db, projectId, [item({ ...started(), runId }), item({ ...decision(at), runId })]);
    return incidentId(projectId, runId);
}

// The M1 attack: a web page's IBAN reached payInvoice
export function verdict(fields: Partial<StoredVerdict> = {}): StoredVerdict {
    return {
        category: "bad input",
        entry: {
            stepId: STEP,
            agent: "researcher",
            at: "2026-10-03T12:00:01.500Z",
            origin: "web:acme-billing.net",
            trust: "untrusted",
            sensitivity: "public",
            flags: ["instructions"],
            contentId: "c1",
            key: "iban:GB33…5555#" + "e".repeat(32),
        },
        turning: { stepId: STEP, agent: "planner", at: "2026-10-03T12:00:01.000Z" },
        damage: { stepId: TOOL_STEP, agent: "billing", at: "2026-10-03T12:00:02.000Z", tool: "payInvoice", ran: false },
        missingGuard: null,
        values: [],
        versions: [],
        ...fields,
    };
}

export function replay(fields: Partial<StoredReplay> = {}): StoredReplay {
    return {
        model: "gpt-5.4-mini",
        harmfulCall: { tool: "payInvoice", keys: ["iban:GB33…5555#" + "e".repeat(32)] },
        removed: { contentId: "c1", origin: "web:acme-billing.net", callId: "call_1" },
        rounds: [],
        outcome: null,
        limited: null,
        error: null,
        ...fields,
    };
}
