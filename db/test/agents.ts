import type { ContentEvent, DecisionEvent, ModelCallEvent, ToolCallEvent } from "@quard/shared";
import type { RunItem } from "../queries/ingest/rows.ts";

// Builders for runs with several agents. Times are ISO strings.
type RunEvent = RunItem["event"];

// Run and step ids made from a number
export const runOf = (n: number): string => n.toString(16).padStart(32, "0");
export const stepOf = (n: number): string => n.toString(16).padStart(16, "0");

export const start = (runId: string, agent: string, at: string): RunEvent => ({
    type: "run_started",
    runId,
    agent,
    at,
    origins: {},
});

export const finish = (runId: string, agent: string, at: string): RunEvent => ({
    type: "run_finished",
    runId,
    agent,
    at,
    status: "completed",
});

// A priced model call that took one second: it cost $0.0031
export const model = (
    runId: string,
    agent: string,
    stepId: string,
    at: string,
    more: Partial<ModelCallEvent> = {},
): ModelCallEvent => ({
    type: "model_call",
    runId,
    agent,
    stepId,
    at,
    model: "gpt-5.4-mini",
    toolCalls: [],
    status: "ok",
    durationMs: 1000,
    usage: { inputTokens: 2000, cachedTokens: 1000, outputTokens: 500 },
    ...more,
});

export const tool = (
    runId: string,
    agent: string,
    stepId: string,
    at: string,
    more: Partial<ToolCallEvent> = {},
): ToolCallEvent => ({
    type: "tool_call",
    runId,
    agent,
    stepId,
    at,
    tool: "delegate",
    arguments: {},
    status: "ok",
    influenced: false,
    flagged: false,
    durationMs: 10,
    ...more,
});

// Content read for a step
export const label = (
    runId: string,
    stepId: string,
    contentId: string,
    at: string,
    trust: "trusted" | "untrusted" = "untrusted",
): ContentEvent => ({
    type: "content",
    runId,
    agent: "billing",
    stepId,
    at,
    contentId,
    origin: trust === "untrusted" ? "web:acme-billing.net" : "user",
    trust,
    sensitivity: "public",
    flags: [],
    keys: [],
});

export const check = (
    runId: string,
    agent: string,
    stepId: string,
    at: string,
    decision: DecisionEvent["decision"],
    more: Partial<DecisionEvent> = {},
): DecisionEvent => ({
    type: "decision",
    runId,
    agent,
    stepId,
    at,
    tool: "payInvoice",
    guard: "action",
    rule: "iban:from",
    decision,
    mode: "block",
    enforced: true,
    ...more,
});
