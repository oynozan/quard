import type { RunAgentEvent, RunHandoff, RunLabel, RunMemory, RunMessage } from "@quard/db";
import { contextOf, isInfluenced } from "../../labels/context";
import type { Label } from "../../types";
import type { AgentLink, RunEdge, Step } from "../types";

const ms = (date: Date) => date.getTime();
const plural = (count: number) => `${count} ${count === 1 ? "item" : "items"}`;

const base = {
    durationMs: 0,
    status: "ok" as const,
    args: [],
    output: null,
    model: null,
    guard: null,
    link: null,
    memory: null,
    approval: null,
    hosted: false,
    error: null,
};

// What came in or went out goes first, so it names the context when it is the least trusted
function stepOf(event: RunAgentEvent, carried: Label, labels: RunLabel[]) {
    const at = ms(event.at);
    const read = labels.filter((label) => ms(label.at) < at);
    const context = contextOf([
        carried,
        ...read.map(({ origin, trust, sensitivity }) => ({ origin, trust, sensitivity })),
    ]);
    return {
        ...base,
        id: event.eventId,
        agent: event.agent,
        startedAt: at,
        context,
        influenced: isInfluenced(context),
    };
}

function messageStep(event: RunMessage, labels: RunLabel[]): Step {
    const carried: Label = { origin: `agent:${event.from}`, trust: event.trust, sensitivity: event.sensitivity };
    const detail = event.verified ? "" : "Unverified · read as untrusted";
    const link: AgentLink = {
        kind: "message",
        from: event.from,
        to: event.agent,
        channel: null,
        carries: [carried],
        labelRef: event.labelRef,
        untrusted: event.trust === "untrusted" || !event.verified,
        verified: event.verified,
        summary: detail,
    };
    // Its parent is the receive call
    return {
        ...stepOf(event, carried, labels),
        parentId: event.stepId,
        kind: "message",
        name: `${event.from} → ${event.agent}`,
        detail,
        link,
    };
}

function handoffStep(event: RunHandoff, labels: RunLabel[]): Step {
    const carried: Label = { origin: `agent:${event.agent}`, trust: event.trust, sensitivity: event.sensitivity };
    const detail = event.via === "tool" ? `Ran ${event.to} as a tool` : "";
    const link: AgentLink = {
        // An agent run as a tool works one level down, like a delegation
        kind: event.via === "tool" ? "delegation" : "handoff",
        from: event.agent,
        to: event.to,
        // The OpenAI Agents SDK hands off inside one process
        channel: "in-process",
        carries: [carried],
        labelRef: null,
        untrusted: event.trust === "untrusted",
        verified: true,
        summary: detail,
    };
    return {
        ...stepOf(event, carried, labels),
        parentId: event.stepId,
        kind: "handoff",
        name: `${event.agent} → ${event.to}`,
        detail,
        link,
    };
}

// Items without a matching label, or a write whose label was not stored, read back as untrusted
function memoryDetail(event: RunMemory): string {
    const missing = event.items - event.verified;
    if (event.op === "write") return missing > 0 ? "Label not stored · reads back as untrusted" : "";
    if (missing > 0) return `${missing} of ${plural(event.items)} unmatched · read as untrusted`;
    return `Read ${plural(event.items)}`;
}

function memoryStep(event: RunMemory, labels: RunLabel[]): Step {
    const label: Label = { origin: `memory:${event.store}`, trust: event.trust, sensitivity: event.sensitivity };
    const { store, op, items, verified } = event;
    return {
        ...stepOf(event, label, labels),
        parentId: null,
        kind: op === "read" ? "memory_read" : "memory_write",
        name: store,
        detail: memoryDetail(event),
        memory: { store, op, items, verified, label },
    };
}

// A run's messages, handoffs and memory reads and writes as steps
export function agentSteps(events: RunAgentEvent[], labels: RunLabel[]): Step[] {
    return events.map((event) => {
        if (event.type === "message") return messageStep(event, labels);
        if (event.type === "handoff") return handoffStep(event, labels);
        return memoryStep(event, labels);
    });
}

// The run graph's edges: every step that moved work or a message between two agents
export function edgesOf(steps: Step[]): RunEdge[] {
    return steps.flatMap((step) =>
        step.link && step.link.from !== step.link.to
            ? [
                  {
                      stepId: step.id,
                      kind: step.link.kind,
                      from: step.link.from,
                      to: step.link.to,
                      at: step.startedAt,
                      channel: step.link.channel,
                      carries: step.link.carries,
                      untrusted: step.link.untrusted,
                      summary: step.link.summary,
                  },
              ]
            : [],
    );
}
