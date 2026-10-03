import type { ingestBatch } from "@quard/db";

// What webhook hands to ingestBatch, typed by the shared event schema
export type UploadItem = Parameters<typeof ingestBatch>[2][number];
type RunEvent = UploadItem["event"];
type DecisionEvent = Extract<RunEvent, { type: "decision" }>;

export type Run = { runId: string; agent: string };

type DecisionFields = Pick<DecisionEvent, "tool" | "guard" | "rule" | "decision"> &
    Partial<Pick<DecisionEvent, "mode" | "reason" | "field">>;

let next = 0;

// Each event in its upload envelope with a fresh id
export function upload(events: RunEvent[]): UploadItem[] {
    return events.map((event) => ({ id: (++next).toString(16).padStart(16, "0"), event }));
}

// Ids in the shapes the schema asks for
export const runId = (n: number) => n.toString(16).padStart(32, "a");
export const stepId = (n: number) => n.toString(16).padStart(16, "b");

const iso = (at: number) => new Date(at).toISOString();

export const started = (run: Run, at: number): RunEvent => ({ type: "run_started", ...run, at: iso(at), origins: {} });

export const finished = (run: Run, at: number): RunEvent => ({
    type: "run_finished",
    ...run,
    at: iso(at),
    status: "completed",
});

export const modelCall = (run: Run, step: string, at: number, model = "gpt-5.4-mini"): RunEvent => ({
    type: "model_call",
    ...run,
    stepId: step,
    at: iso(at),
    model,
    toolCalls: [],
    usage: { inputTokens: 1000, cachedTokens: 0, outputTokens: 200 },
    status: "ok",
    durationMs: 400,
});

export const toolCall = (
    run: Run,
    step: string,
    at: number,
    tool: string,
    status: "ok" | "blocked" = "ok",
): RunEvent => ({
    type: "tool_call",
    ...run,
    stepId: step,
    at: iso(at),
    tool,
    arguments: {},
    status,
    influenced: false,
    flagged: false,
    keys: [],
    durationMs: 20,
});

// Block mode unless the fields say observe
export const decision = (run: Run, step: string, at: number, fields: DecisionFields): RunEvent => ({
    type: "decision",
    ...run,
    stepId: step,
    at: iso(at),
    mode: "block",
    ...fields,
    enforced: (fields.mode ?? "block") === "block",
});

// The SDK saw a tool the model asked for that no guard() wraps
export const unwrappedTool = (run: Run, step: string, at: number, tool: string): RunEvent => ({
    type: "warning",
    ...run,
    stepId: step,
    at: iso(at),
    code: "unwrapped_tool",
    tool,
});
