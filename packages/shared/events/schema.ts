import { z } from "zod";

// Events the SDK records for each run. M2 sends them to webhook.

// Strict shapes, so bad data is refused at the door instead of failing in the database
const runId = z.string().regex(/^[0-9a-f]{32}$/);
const stepId = z.string().regex(/^[0-9a-f]{16}$/);
const at = z.iso.datetime();
const durationMs = z.number().min(0).max(2_147_483_647);
const tokens = z.number().int().min(0);

const base = {
    runId,
    stepId,
    agent: z.string().min(1),
    at,
};

const trust = z.enum(["trusted", "untrusted"]);
const sensitivity = z.enum(["internal", "public"]);

// The origin overrides in force when the run started
export const runStartedEvent = z.object({
    type: z.literal("run_started"),
    runId,
    agent: z.string().min(1),
    at,
    origins: z.record(z.string(), z.object({ trust: trust.optional(), sensitivity: sensitivity.optional() })),
});

// The end of a quard.run(): how its function finished. "blocked" means a
// guard with onBlock: "throw" stopped it.
export const runFinishedEvent = z.object({
    type: z.literal("run_finished"),
    runId,
    agent: z.string().min(1),
    at,
    status: z.enum(["completed", "failed", "blocked"]),
    error: z.string().optional(),
});

export const modelCallEvent = z.object({
    type: z.literal("model_call"),
    ...base,
    parentStepId: stepId.optional(),
    model: z.string(),
    responseId: z.string().optional(),
    toolCalls: z.array(z.object({ callId: z.string(), name: z.string(), arguments: z.string() })),
    // Token counts the API reported. Cached tokens are part of the input count.
    usage: z.object({ inputTokens: tokens, cachedTokens: tokens, outputTokens: tokens }).optional(),
    // The agent's model, instructions and tools, as a hash control knows
    agentVersion: z
        .string()
        .regex(/^[0-9a-f]{16}$/)
        .optional(),
    status: z.enum(["ok", "error"]),
    durationMs,
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
    // Value keys in the arguments, so search can find them after redaction
    keys: z.array(z.string()).optional(),
    durationMs,
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
    // The hash of the active rules, as sent to control
    rules: z
        .string()
        .regex(/^[0-9a-f]{16}$/)
        .optional(),
    // The approval request that answered this call
    request: z
        .string()
        .regex(/^apr_[0-9a-f]{16}$/)
        .optional(),
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

const labelName = z.string().regex(/^[a-z][a-z_]{0,39}$/);

// A chunk of public content and the label a detector gave it. The text
// is redacted, and kept so people can check the label.
export const chunkLabelEvent = z.object({
    type: z.literal("chunk_label"),
    ...base,
    tool: z.string(),
    detector: z.string().min(1),
    // Where the chunk sits in the content, from 0
    chunk: z.number().int().min(0),
    text: z.string(),
    label: labelName,
    probabilities: z.record(labelName, z.number().min(0).max(1)),
    // The chance the chunk is an attack: its risky labels added up
    score: z.number().min(0).max(1),
});

export const runEvent = z.discriminatedUnion("type", [
    runStartedEvent,
    runFinishedEvent,
    modelCallEvent,
    toolCallEvent,
    decisionEvent,
    contentEvent,
    warningEvent,
    chunkLabelEvent,
    configErrorEvent,
]);

export type RunEvent = z.infer<typeof runEvent>;
export type RunStartedEvent = z.infer<typeof runStartedEvent>;
export type RunFinishedEvent = z.infer<typeof runFinishedEvent>;
export type ModelCallEvent = z.infer<typeof modelCallEvent>;
export type ToolCallEvent = z.infer<typeof toolCallEvent>;
export type DecisionEvent = z.infer<typeof decisionEvent>;
export type ContentEvent = z.infer<typeof contentEvent>;
export type WarningEvent = z.infer<typeof warningEvent>;
export type ConfigErrorEvent = z.infer<typeof configErrorEvent>;
