import type { ingestBatch } from "@quard/db";
import { NOW } from "../time";

// Events as webhook hands them to ingestBatch, built for runs with several agents

export type Item = Parameters<typeof ingestBatch>[2][number];
type Event = Item["event"];
type Of<T extends Event["type"]> = Extract<Event, { type: T }>;

export const runOf = (n: number): string => n.toString(16).padStart(32, "0");
export const stepOf = (n: number): string => n.toString(16).padStart(16, "0");

// The time this many seconds before NOW
export const ago = (seconds: number): string => new Date(NOW - seconds * 1000).toISOString();

export const start = (runId: string, agent: string, at: string): Of<"run_started"> => ({
    type: "run_started",
    runId,
    agent,
    at,
    origins: {},
});

export const finish = (runId: string, agent: string, at: string): Of<"run_finished"> => ({
    type: "run_finished",
    runId,
    agent,
    at,
    status: "completed",
});

// A priced model call that took one second and cost $0.0031
export const model = (
    runId: string,
    agent: string,
    stepId: string,
    at: string,
    more: Partial<Of<"model_call">> = {},
): Of<"model_call"> => ({
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
    more: Partial<Of<"tool_call">> = {},
): Of<"tool_call"> => ({
    type: "tool_call",
    runId,
    agent,
    stepId,
    at,
    tool: "payInvoice",
    arguments: {},
    status: "ok",
    influenced: false,
    flagged: false,
    durationMs: 10,
    ...more,
});

// The label of the untrusted page these runs read
export const WEB_PAGE = { origin: "web:billing.example", trust: "untrusted", sensitivity: "public" } as const;

// Untrusted content read for a step
export const content = (runId: string, agent: string, stepId: string, at: string): Of<"content"> => ({
    type: "content",
    runId,
    agent,
    stepId,
    at,
    contentId: `${stepId}@${at}`,
    ...WEB_PAGE,
    flags: [],
    keys: [],
});

export const check = (
    runId: string,
    agent: string,
    stepId: string,
    at: string,
    decision: Of<"decision">["decision"],
    more: Partial<Of<"decision">> = {},
): Of<"decision"> => ({
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

let next = 0;

// Each event in its upload envelope, with a fresh event id
export const items = (events: Event[]): Item[] =>
    events.map((event) => ({ id: (++next).toString(16).padStart(16, "e"), event }));
