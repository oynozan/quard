import type { AgentMessageRecord } from "@quard/db";

// The parts of a stored run that the finder reads. They match RunDetail
// from @quard/db, plus the run's messages from getAgentMessages().

export type StoredStep = {
    stepId: string;
    kind: "model_call" | "tool_call";
    agent: string;
    name: string;
    callId: string | null;
    status: string;
    at: Date;
    durationMs: number;
    detail: unknown;
};

export type StoredLabel = {
    contentId: string;
    stepId: string;
    agent: string;
    origin: string;
    trust: "trusted" | "untrusted";
    sensitivity: "internal" | "public";
    flags: string[];
    keys: string[];
    at: Date;
};

export type StoredDecision = {
    stepId: string;
    tool: string;
    guard: string;
    rule: string;
    decision: string;
    mode: "block" | "observe";
    enforced: boolean;
};

export type StoredRun = {
    steps: StoredStep[];
    labels: StoredLabel[];
    decisions: StoredDecision[];
    messages: AgentMessageRecord[];
};

function fieldOf(detail: unknown, field: string): unknown {
    return (detail as Record<string, unknown> | null | undefined)?.[field];
}

function listIn(detail: unknown, field: string): unknown[] {
    const value = fieldOf(detail, field);
    return Array.isArray(value) ? value : [];
}

// The value keys stored with a tool call, such as "iban:DE89…3000#<hash>"
export function keysOf(step: StoredStep): string[] {
    return listIn(step.detail, "keys").filter((key): key is string => typeof key === "string");
}

// The call ids a model call asked for
export function callIdsOf(step: StoredStep): string[] {
    return listIn(step.detail, "toolCalls")
        .map((call) => (call as { callId?: unknown } | null)?.callId)
        .filter((id): id is string => typeof id === "string");
}

// The agent version a model call ran with, when the SDK sent one
export function versionOf(step: StoredStep): string | undefined {
    const version = fieldOf(step.detail, "agentVersion");
    return typeof version === "string" ? version : undefined;
}

// What a model call cost, when its model has a known price
export function costOfStep(step: StoredStep): number | undefined {
    const cost = fieldOf(step.detail, "costUsd");
    return typeof cost === "number" ? cost : undefined;
}

export function happenedBy(moment: Date): (item: { at: Date }) => boolean {
    return (item) => item.at.getTime() <= moment.getTime();
}

// Content a step read: stored by the time the step started, or the step's
// own input. Times are whole ms, and a tool's output is often labeled in
// the same ms the next model call starts, so a tie counts as read.
export function readBy(step: StoredStep): (label: StoredLabel) => boolean {
    const start = step.at.getTime() - step.durationMs;
    return (label) => label.at.getTime() <= start || label.stepId === step.stepId;
}

export function byTime(a: { at: Date }, b: { at: Date }): number {
    return a.at.getTime() - b.at.getTime();
}
