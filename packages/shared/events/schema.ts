import { z } from "zod";

// Events the SDK records for each run. M2 sends them to webhook.

const base = {
    runId: z.string(),
    stepId: z.string(),
    agent: z.string(),
    at: z.string(),
};

const trust = z.enum(["trusted", "untrusted"]);
const sensitivity = z.enum(["internal", "public"]);

// The origin overrides in force when the run started
export const runStartedEvent = z.object({
    type: z.literal("run_started"),
    runId: z.string(),
    agent: z.string(),
    at: z.string(),
    origins: z.record(z.string(), z.object({ trust: trust.optional(), sensitivity: sensitivity.optional() })),
});

export const modelCallEvent = z.object({
    type: z.literal("model_call"),
    ...base,
    parentStepId: z.string().optional(),
    model: z.string(),
    responseId: z.string().optional(),
    toolCalls: z.array(z.object({ callId: z.string(), name: z.string(), arguments: z.string() })),
    status: z.enum(["ok", "error"]),
    durationMs: z.number(),
});

export const toolCallEvent = z.object({
    type: z.literal("tool_call"),
    ...base,
    tool: z.string(),
    callId: z.string().optional(),
    arguments: z.unknown(),
    status: z.enum(["ok", "error", "blocked"]),
    // The model read untrusted content before asking for this call
    influenced: z.boolean(),
    // Some of that content was flagged by a source guard
    flagged: z.boolean(),
    durationMs: z.number(),
    error: z.string().optional(),
});

export const decisionEvent = z.object({
    type: z.literal("decision"),
    ...base,
    tool: z.string(),
    guard: z.string(),
    rule: z.string(),
    decision: z.enum(["allow", "block", "ask", "pass", "strip", "flag"]),
    mode: z.enum(["block", "observe"]),
    enforced: z.boolean(),
    reason: z.string().optional(),
    field: z.string().optional(),
    // The version of the policy file in force, when one is set
    policy: z.string().optional(),
    // A detector's risk score, from 0 to 1
    score: z.number().min(0).max(1).optional(),
});

// A policy file or signature feed that failed to load. The last good one stays.
export const configErrorEvent = z.object({
    type: z.literal("config_error"),
    at: z.string(),
    source: z.enum(["policy", "signatures"]),
    message: z.string(),
});

export const contentEvent = z.object({
    type: z.literal("content"),
    ...base,
    contentId: z.string(),
    origin: z.string(),
    trust,
    sensitivity,
    flags: z.array(z.string()),
    keys: z.array(z.string()),
});

export const warningEvent = z.object({
    type: z.literal("warning"),
    ...base,
    code: z.string(),
    tool: z.string().optional(),
});

export const runEvent = z.discriminatedUnion("type", [
    runStartedEvent,
    modelCallEvent,
    toolCallEvent,
    decisionEvent,
    contentEvent,
    warningEvent,
    configErrorEvent,
]);

export type RunEvent = z.infer<typeof runEvent>;
export type RunStartedEvent = z.infer<typeof runStartedEvent>;
export type ModelCallEvent = z.infer<typeof modelCallEvent>;
export type ToolCallEvent = z.infer<typeof toolCallEvent>;
export type DecisionEvent = z.infer<typeof decisionEvent>;
export type ContentEvent = z.infer<typeof contentEvent>;
export type WarningEvent = z.infer<typeof warningEvent>;
export type ConfigErrorEvent = z.infer<typeof configErrorEvent>;
