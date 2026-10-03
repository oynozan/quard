import type { AgentRunCalls, RunDecisionDetail, RunLabel, RunStep } from "@quard/db";
import { NOW } from "../time";
import { WEB_PAGE } from "./events";

// Stored rows of one run in an agent's timeline, as agentRecentCalls returns them

// The time this many seconds after NOW
export const at = (seconds: number): Date => new Date(NOW + seconds * 1000);

export const step = (fields: Partial<RunStep> & Pick<RunStep, "stepId" | "kind" | "at">): RunStep => ({
    agent: "billing",
    parentStepId: null,
    name: fields.kind === "model_call" ? "gpt-5.4-mini" : "payInvoice",
    callId: null,
    status: "ok",
    influenced: false,
    flagged: false,
    durationMs: 1000,
    detail: {},
    ...fields,
});

export const label = (fields: Partial<RunLabel> & Pick<RunLabel, "contentId" | "stepId" | "at">): RunLabel => ({
    agent: "billing",
    ...WEB_PAGE,
    flags: [],
    keys: [],
    ...fields,
});

let next = 0;

export const decision = (
    fields: Partial<RunDecisionDetail> & Pick<RunDecisionDetail, "stepId" | "at" | "decision">,
): RunDecisionDetail => ({
    eventId: (++next).toString(16).padStart(16, "e"),
    agent: "billing",
    tool: "payInvoice",
    guard: "action",
    rule: "iban:from",
    mode: "block",
    enforced: true,
    reason: null,
    field: null,
    rulesHash: null,
    requestId: null,
    degraded: false,
    score: null,
    ...fields,
});

export const run = (runId: string, rows: Partial<Omit<AgentRunCalls, "runId">>): AgentRunCalls => ({
    runId,
    steps: [],
    labels: [],
    decisions: [],
    ...rows,
});
