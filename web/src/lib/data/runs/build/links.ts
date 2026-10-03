import { maskText } from "../../../mask";
import { uniqueLabels } from "../../labels/context";
import { agentLabel, labelFor } from "../../labels/origins";
import { toolCall } from "./calls";
import type { Overrides } from "./checks";
import type { BuildState, Mark, ValueSpec } from "./state";
import type { Label } from "../../types";
import type { Channel, LinkKind, Step } from "../types";

export type Content = { text: string; values?: ValueSpec[] };

export type LinkOptions = {
    kind?: "delegation" | "handoff";
    channel?: Channel;
    decide?: Overrides;
    // Marks the handoff step, and optionally the delegate call before it.
    mark?: Mark;
    markCall?: Mark;
};

// The labels an agent passes on: everything it has read.
function carriedBy(s: BuildState, agent: string): Label[] {
    const read = uniqueLabels(s.readBy(agent));
    return read.length ? read : [{ origin: `agent:${agent}`, trust: "trusted", sensitivity: "internal" }];
}

function linkStep(
    s: BuildState,
    from: string,
    to: string,
    content: Content,
    kind: LinkKind,
    channel: Channel,
    parentId: string | null,
): Step {
    const carries = carriedBy(s, from);
    const label = agentLabel(from, carries);
    const step = s.step(from, kind === "message" ? "message" : "handoff", `${from} to ${to}`, parentId, s.int(2, 30));
    const summary = maskText(content.text);
    step.detail = summary;
    step.link = {
        kind,
        from,
        to,
        channel,
        carries,
        labelRef: `lr_${s.newId().slice(0, 12)}`,
        untrusted: label.trust === "untrusted",
        summary,
    };
    s.remember(content.values ?? [], label, step.id, from, step.startedAt);
    // The receiver reads the content with the labels the sender attached.
    s.see(to, carries);
    if (kind !== "message") s.session.set(to, step.id);
    s.wait(step.durationMs);
    return step;
}

// Sending is a guarded tool like any other: it checks depth, fan-out and loops first.
export function delegateTo(s: BuildState, from: string, to: string, brief: Content, opts: LinkOptions = {}) {
    if (!s.parents.has(to)) s.parents.set(to, from);
    if (!s.parents.has(from)) s.parents.set(from, null);
    const pair = [from, to].sort();
    const key = pair.join(">");
    const loops = (s.handoffs.get(key) ?? 0) + 1;
    s.handoffs.set(key, loops);
    const links = { depth: s.depthOf(to), fanOut: s.childrenOf(from), loops, pair: `${pair[0]} and ${pair[1]}` };
    const sent = toolCall(s, from, "delegate", {
        args: { to, brief: brief.text },
        kinds: { to: "text", brief: "text" },
        decide: opts.decide,
        links,
        mark: opts.markCall,
    });
    if (sent.result !== "ran") return { call: sent.step, link: null };
    const link = linkStep(s, from, to, brief, opts.kind ?? "delegation", opts.channel ?? "in-process", sent.step.id);
    if (opts.mark) s.mark(opts.mark, link.id);
    return { call: sent.step, link };
}

// A reply or a note from one agent to another, such as a helper's result.
export function sendMessage(s: BuildState, from: string, to: string, content: Content, mark?: Mark): Step {
    const step = linkStep(s, from, to, content, "message", "in-process", s.parentFor(from));
    if (mark) s.mark(mark, step.id);
    return step;
}

export type MemoryOptions = { label?: Label; hashOk?: boolean; values?: ValueSpec[]; summary?: string };

// Reads and writes through the shared-memory wrapper. Labels come back on read.
export function memoryStep(
    s: BuildState,
    agent: string,
    op: "read" | "write",
    store: string,
    key: string,
    opts: MemoryOptions = {},
): Step {
    const hashOk = opts.hashOk ?? true;
    const step = s.step(agent, op === "read" ? "memory_read" : "memory_write", store, s.parentFor(agent), s.int(4, 40));
    const label =
        op === "write"
            ? s.context(agent)
            : hashOk
              ? (opts.label ?? labelFor(`memory:${store}`))
              : labelFor(`memory:${store}`);
    step.memory = { store, key, label, hashOk };
    step.detail = opts.summary ? maskText(opts.summary) : `${op === "read" ? "Read" : "Wrote"} ${store}/${key}`;
    if (!hashOk) step.detail = `${step.detail}. Changed outside the wrapper, so it reads back as untrusted`;
    if (op === "read") {
        s.remember(opts.values ?? [], label, step.id, agent, step.startedAt);
        s.see(agent, [label]);
    }
    s.wait(step.durationMs);
    return step;
}
