import type { AgentMessageRecord, HandoffFault, StoredVerdict, VerdictHandoff } from "@quard/db";
import { happenedBy, type StoredLabel, type StoredStep } from "./run.ts";
import type { TracedValue } from "./trace.ts";

type Message = AgentMessageRecord;

// The latest message or handoff into the damage agent up to the turning
// point. One from the entry agent, or an agent it reached, comes first.
export function carrierOf(
    messages: Message[],
    entryAgent: string,
    damage: StoredStep,
    turning: StoredStep,
): Message | undefined {
    const before = messages.filter(happenedBy(turning.at)).filter((item) => item.from !== item.to);
    const reached = before.reduce(
        (agents, item) => (agents.has(item.from) ? new Set([...agents, item.to]) : agents),
        new Set([entryAgent]),
    );
    const into = before.filter((item) => item.to === damage.agent);
    return into.findLast((item) => reached.has(item.from)) ?? into.at(-1);
}

function handoffOf({ stepId, kind, from, to, at, trust, verified }: Message): VerdictHandoff {
    return { stepId, kind, from, to, at: at.toISOString(), trust, verified };
}

// The agents the harm passed through. Null when only one agent took part.
export function acrossAgentsOf(
    messages: Message[],
    entry: { agent: string },
    turning: StoredStep,
    damage: StoredStep,
): StoredVerdict["acrossAgents"] {
    const carrier = carrierOf(messages, entry.agent, damage, turning);
    if (carrier === undefined && new Set([entry.agent, turning.agent, damage.agent]).size === 1) {
        return null;
    }
    return {
        entryAgent: entry.agent,
        handoff: carrier === undefined ? null : handoffOf(carrier),
        turningAgent: turning.agent,
        damageAgent: damage.agent,
    };
}

// How a handoff into the damage agent went wrong, when nothing untrusted
// came in. Null when no handoff carried the damaging value.
// "constraint dropped" needs the message text, which is not stored, so
// the finder never names it.
export function handoffFaultOf(
    carrier: Message | undefined,
    messages: Message[],
    values: TracedValue[],
    labels: StoredLabel[],
    damage: StoredStep,
): HandoffFault | null {
    if (carrier === undefined) {
        return null;
    }
    // Content a receive guard labeled as it took a message in
    const received = new Set(
        messages.filter((item) => item.kind === "message" && item.to === damage.agent).map((item) => item.stepId),
    );
    const other = (origin: string) => origin.startsWith("agent:") && origin !== `agent:${damage.agent}`;
    const fromOther = values.some(
        ({ appearances: [first] }) => first !== undefined && (other(first.origin) || received.has(first.stepId)),
    );
    if (fromOther || !carrier.verified || carrier.trust === "untrusted") {
        return "wrong information sent";
    }
    // A value found in none of the run's content: the receiver made it up
    const seen = new Set(labels.flatMap((label) => label.keys));
    return values.some((value) => !seen.has(value.key)) ? "correct message misread" : null;
}
