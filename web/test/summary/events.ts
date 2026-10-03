import type { ingestBatch } from "@quard/db";

// The shared event schema types, as ingestBatch takes them
type Item = Parameters<typeof ingestBatch>[2][number];
type RunEvent = Item["event"];
type Decision = Extract<RunEvent, { type: "decision" }>;

// Run and step ids made from a number
export const runOf = (n: number): string => n.toString(16).padStart(32, "0");
export const stepOf = (n: number): string => n.toString(16).padStart(16, "0");

let next = 0;

// Each event in its upload envelope, with a fresh event id
export function itemsOf(...events: RunEvent[]): Item[] {
    return events.map((event) => {
        next += 1;
        return { id: next.toString(16).padStart(16, "e"), event };
    });
}

const iso = (at: number): string => new Date(at).toISOString();

// An enforced block by one guard on a tool call
export function block(runId: string, at: number, guard: string, more: Partial<Decision> = {}): Decision {
    return {
        type: "decision",
        runId,
        stepId: stepOf(1),
        agent: "billing",
        at: iso(at),
        tool: "payInvoice",
        guard,
        rule: guard,
        decision: "block",
        mode: "block",
        enforced: true,
        reason: "value_not_from_allowed_origin",
        ...more,
    };
}

// A model call, started by another agent's step when parentStepId is set
export function modelCall(runId: string, stepId: string, agent: string, at: number, parentStepId?: string): RunEvent {
    return {
        type: "model_call",
        runId,
        stepId,
        agent,
        at: iso(at),
        ...(parentStepId ? { parentStepId } : {}),
        model: "gpt-5.4-mini",
        toolCalls: [],
        status: "ok",
        durationMs: 1000,
    };
}

// The tool call that hands work to another agent
export function delegate(runId: string, stepId: string, agent: string, at: number): RunEvent {
    return {
        type: "tool_call",
        runId,
        stepId,
        agent,
        at: iso(at),
        tool: "delegate",
        arguments: {},
        status: "ok",
        influenced: false,
        flagged: false,
        durationMs: 10,
    };
}

// A web page a model call read, which is untrusted by default
export function webPage(runId: string, stepId: string, agent: string, at: number): RunEvent {
    return {
        type: "content",
        runId,
        stepId,
        agent,
        at: iso(at),
        contentId: `c${stepId}`,
        origin: "web:acme-billing.net",
        trust: "untrusted",
        sensitivity: "public",
        flags: [],
        keys: [],
    };
}
