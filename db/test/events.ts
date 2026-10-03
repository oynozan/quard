import type { DecisionEvent, ModelCallEvent } from "@quard/shared";
import type { RunItem } from "../queries/ingest/rows.ts";

// Events that belong to a run
type RunEvent = RunItem["event"];

export const RUN = "1".repeat(32);
export const STEP = "2".repeat(16);
export const TOOL_STEP = "3".repeat(16);

let next = 0;

// Each event in its upload envelope, with a fresh event id
export function item(event: RunItem["event"], degraded?: boolean): RunItem {
    next += 1;
    return { id: next.toString(16).padStart(16, "a"), event, ...(degraded === undefined ? {} : { degraded }) };
}

const base = (at: string) => ({ runId: RUN, agent: "billing", at });

export const started = (at = "2026-10-03T12:00:00.000Z"): RunEvent => ({
    type: "run_started",
    runId: RUN,
    agent: "billing",
    at,
    origins: { "mcp:crm": { trust: "trusted" } },
});

export const finished = (status: "completed" | "failed" | "blocked" = "completed", error?: string): RunEvent => ({
    type: "run_finished",
    runId: RUN,
    agent: "billing",
    at: "2026-10-03T12:00:10.000Z",
    status,
    ...(error === undefined ? {} : { error }),
});

export const modelCall = (at = "2026-10-03T12:00:01.000Z"): ModelCallEvent => ({
    type: "model_call",
    ...base(at),
    stepId: STEP,
    model: "gpt-5.4-mini",
    toolCalls: [{ callId: "call_1", name: "payInvoice", arguments: '{"iban":"DE89…3000"}' }],
    status: "ok",
    durationMs: 812.4,
    responseId: "resp_1",
    usage: { inputTokens: 2000, cachedTokens: 1000, outputTokens: 500 },
});

export const toolCall = (status: "ok" | "blocked" = "blocked", at = "2026-10-03T12:00:02.000Z"): RunEvent => ({
    type: "tool_call",
    ...base(at),
    stepId: TOOL_STEP,
    tool: "payInvoice",
    callId: "call_1",
    arguments: { iban: "DE89…3000", amount: 4950 },
    status,
    influenced: true,
    flagged: false,
    durationMs: 3,
    keys: ["iban:DE89…3000#" + "f".repeat(32)],
});

export const content = (flags: string[] = ["instructions"], at = "2026-10-03T12:00:01.500Z"): RunEvent => ({
    type: "content",
    ...base(at),
    stepId: STEP,
    contentId: "c1",
    origin: "web:acme-billing.net",
    trust: "untrusted",
    sensitivity: "public",
    flags,
    keys: ["iban:GB33…5555#" + "e".repeat(32)],
});

export const decision = (at = "2026-10-03T12:00:02.000Z"): DecisionEvent => ({
    type: "decision",
    ...base(at),
    stepId: TOOL_STEP,
    tool: "payInvoice",
    guard: "action",
    rule: "iban:from",
    decision: "block",
    mode: "block",
    enforced: true,
    reason: "value_not_from_allowed_origin",
    field: "iban",
});

export const warning = (at = "2026-10-03T12:00:03.000Z"): RunEvent => ({
    type: "warning",
    ...base(at),
    stepId: STEP,
    code: "unwrapped_tool",
    tool: "deleteFiles",
});

// A message the billing agent received from the orchestrator
export const message = (at = "2026-10-03T12:00:04.000Z"): RunEvent => ({
    type: "message",
    ...base(at),
    stepId: "5".repeat(16),
    from: "orchestrator",
    parentStepId: STEP,
    labelRef: "a".repeat(16),
    verified: true,
    trust: "untrusted",
    sensitivity: "public",
});

export const handoff = (via: "handoff" | "tool" = "handoff", at = "2026-10-03T12:00:05.000Z"): RunEvent => ({
    type: "handoff",
    ...base(at),
    stepId: "6".repeat(16),
    to: "refunds",
    via,
    trust: "trusted",
    sensitivity: "internal",
});

export const memory = (at = "2026-10-03T12:00:06.000Z"): RunEvent => ({
    type: "memory",
    ...base(at),
    stepId: "7".repeat(16),
    store: "notes",
    op: "read",
    items: 2,
    verified: 1,
    trust: "untrusted",
    sensitivity: "internal",
});
