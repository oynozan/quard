import type { IncidentRow, StoredReplay, StoredVerdict } from "@quard/db";
import { at, IBAN_KEY, M2, RUN, T1, T2 } from "../runs-fixture";

// The poisoned-invoice run's verdict: the fetched page held the IBAN that payInvoice asked to pay
export function storedVerdict(fields: Partial<StoredVerdict> = {}): StoredVerdict {
    return {
        category: "bad input",
        entry: {
            stepId: T1,
            agent: "billing",
            at: at(3).toISOString(),
            origin: "web:acme-billing.net",
            trust: "untrusted",
            sensitivity: "public",
            flags: ["instructions"],
            contentId: "c3",
            key: IBAN_KEY,
        },
        turning: { stepId: M2, agent: "billing", at: at(5).toISOString() },
        damage: { stepId: T2, agent: "billing", at: at(6).toISOString(), tool: "payInvoice", ran: false },
        missingGuard: null,
        values: [],
        versions: [{ agent: "billing", version: "v3" }],
        ...fields,
    };
}

export function storedReplay(fields: Partial<StoredReplay> = {}): StoredReplay {
    return {
        model: "gpt-5.4-mini",
        harmfulCall: { tool: "payInvoice", keys: [IBAN_KEY] },
        removed: { contentId: "c3", origin: "web:acme-billing.net", callId: "c1" },
        rounds: [],
        outcome: null,
        limited: null,
        error: null,
        ...fields,
    };
}

// A stored incident with its verdict found, the note pending and no replay yet
export function incidentRow(fields: Partial<IncidentRow> = {}): IncidentRow {
    return {
        id: "inc_0123456789abcdef",
        runId: RUN,
        openedAt: at(6),
        findState: "done",
        findError: null,
        reviewState: "pending",
        replayState: "idle",
        verdict: storedVerdict(),
        reviewer: null,
        replay: null,
        spentUsd: 0,
        capUsd: 5,
        category: "bad input",
        damageTool: "payInvoice",
        damageAgent: "billing",
        entryAgent: "billing",
        entryOrigin: "web:acme-billing.net",
        entryTrust: "untrusted",
        turningAgent: "billing",
        ...fields,
    };
}

// The same incident while the finder still works on it
export function pendingRow(fields: Partial<IncidentRow> = {}): IncidentRow {
    return incidentRow({
        verdict: null,
        findState: "pending",
        category: null,
        damageTool: null,
        damageAgent: null,
        entryAgent: null,
        entryOrigin: null,
        entryTrust: null,
        turningAgent: null,
        ...fields,
    });
}
