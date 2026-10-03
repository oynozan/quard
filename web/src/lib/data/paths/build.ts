import { isGuarded } from "../guards/tools";
import { agentLabel, labelFor } from "../labels/origins";
import type { Mark } from "../runs/build/state";
import type { RunDetail, Step } from "../runs/types";
import type { Label, PathNode, PathRole } from "../types";

function originTitle(origin: string): string {
    if (origin.startsWith("search:")) return "Hosted web search";
    const detail = origin.slice(origin.indexOf(":") + 1);
    return detail && detail !== origin ? detail : origin;
}

function scanWords(run: RunDetail, step: Step): string {
    const check = run.steps.find((s) => s.parentId === step.id && s.guard?.guard === "source");
    if (!check?.guard) return isGuarded(step.name) ? "trusted tool result" : "not wrapped with guard(), never scanned";
    if (!check.guard.scan?.scanned) return "unscanned";
    const findings = check.guard.scan.findings;
    return findings.length ? `${check.guard.outcome}: ${findings.join(", ")}` : check.guard.outcome;
}

// One step as a path node. Content that came in shows as its origin.
export function nodeOf(run: RunDetail, step: Step, role: PathRole | null, asOrigin = false): PathNode {
    const base = { role, agent: step.agent, runId: run.summary.id, stepId: step.id, at: step.startedAt };
    if (step.link) {
        const label: Label = agentLabel(step.link.from, step.link.carries);
        const kind = step.link.kind === "message" ? "message" : "handoff";
        return { ...base, kind, title: `${step.link.from} to ${step.link.to}`, detail: step.link.summary, label };
    }
    if (step.memory) {
        return {
            ...base,
            kind: "memory",
            title: `${step.memory.store}/${step.memory.key}`,
            detail: step.detail,
            label: step.memory.label,
        };
    }
    if (step.kind === "model_call") {
        // An entry point inside the model itself, as in bad reasoning, is labeled as the agent.
        const label = asOrigin ? agentLabel(step.agent, [step.context]) : step.context;
        return { ...base, kind: "agent", title: step.agent, detail: step.detail, label };
    }
    if (asOrigin && step.output) {
        const title = originTitle(step.output.label.origin);
        return {
            ...base,
            kind: "origin",
            title,
            detail: `${step.name} · ${scanWords(run, step)}`,
            label: step.output.label,
        };
    }
    if (asOrigin) {
        // A tool that failed before it returned anything.
        const label = labelFor(isGuarded(step.name) ? `tool:${step.name}` : `unknown:${step.name}`);
        return { ...base, kind: "call", title: step.name, detail: `${step.detail} · ${step.error ?? "failed"}`, label };
    }
    const detail = step.error ? `${step.detail} · ${step.error}` : step.detail;
    return { ...base, kind: "call", title: step.name, detail, label: step.context };
}

// The model call where an agent first read content from this step.
function readerOf(run: RunDetail, source: Step): Step | undefined {
    return run.steps.find(
        (step) => step.kind === "model_call" && step.agent === source.agent && step.startedAt > source.startedAt,
    );
}

// The step where content with this origin first came in.
function originStep(run: RunDetail, origin: string): Step | undefined {
    if (origin === "user")
        return run.steps.find((step) => step.kind === "model_call" && step.context.origin === "user");
    return run.steps.find((step) => step.output?.label.origin === origin);
}

// Handoffs and messages that carried an origin from one agent toward the caller, in time order.
function carriers(run: RunDetail, origin: string, from: Step, call: Step): Step[] {
    const chain: Step[] = [];
    let holder = from.agent;
    for (const step of run.steps) {
        if (step.startedAt < from.startedAt || step.startedAt > call.startedAt || !step.link) continue;
        if (step.link.from !== holder || !step.link.carries.some((label) => label.origin === origin)) continue;
        chain.push(step);
        holder = step.link.to;
        if (holder === call.agent) break;
    }
    return holder === call.agent ? chain : [];
}

// How content reached a call: origin, the agent that read it, handoffs, then the call.
export function influencePath(run: RunDetail, call: Step): PathNode[] {
    // Untrusted content that reached the arguments first, else where a traced value came from.
    const seen = call.args
        .flatMap((arg) => arg.valueLabel.appearances)
        .filter((appearance) => !appearance.label.origin.startsWith("agent:"));
    const picked = seen.find((appearance) => appearance.label.trust === "untrusted") ?? seen[0];
    const origin = picked?.label.origin ?? call.context.origin;
    const source = originStep(run, origin);
    if (!source) return [nodeOf(run, call, null)];
    const nodes: PathNode[] = [];
    if (source.kind === "model_call") {
        nodes.push({ ...nodeOf(run, source, null), kind: "origin", title: "user", detail: "The user's message" });
    } else {
        nodes.push(nodeOf(run, source, null, true));
    }
    const links = carriers(run, origin, source, call);
    if (links.length) {
        // The agent that read the content and passed it on.
        const reader = source.kind === "model_call" ? source : readerOf(run, source);
        if (reader && reader.id !== source.id) nodes.push(nodeOf(run, reader, null));
    }
    links.forEach((link, index) => {
        nodes.push(nodeOf(run, link, null));
        if (index === links.length - 1) return;
        const next = run.steps.find(
            (step) => step.kind === "model_call" && step.agent === link.link?.to && step.startedAt > link.startedAt,
        );
        if (next) nodes.push(nodeOf(run, next, null));
    });
    // The model call that asked for this call.
    const asker = run.steps.find((step) => step.id === call.parentId && step.kind === "model_call");
    if (asker && !nodes.some((node) => node.stepId === asker.id)) nodes.push(nodeOf(run, asker, null));
    nodes.push(nodeOf(run, call, null));
    return nodes;
}

// The path the root-cause finder names: entry point, carriers, turning point, damage.
export function incidentPath(run: RunDetail, marks: { role: Mark; stepId: string }[]): PathNode[] {
    const byStep = new Map<string, PathRole[]>();
    for (const mark of marks) byStep.set(mark.stepId, [...(byStep.get(mark.stepId) ?? []), mark.role]);
    const nodes: PathNode[] = [];
    for (const step of run.steps) {
        const roles = byStep.get(step.id);
        if (!roles) continue;
        const role: PathRole = roles.includes("entry") ? "entry" : roles.includes("damage") ? "damage" : roles[0];
        nodes.push(nodeOf(run, step, role, role === "entry"));
        // Show who read the content when another agent took over afterwards.
        const turning = marks.find((mark) => mark.role === "turning");
        const turningAgent = run.steps.find((item) => item.id === turning?.stepId)?.agent;
        if (role === "entry" && step.output) {
            const reader = readerOf(run, step);
            if (reader && !byStep.has(reader.id) && reader.agent !== turningAgent)
                nodes.push(nodeOf(run, reader, null));
        }
    }
    return nodes;
}
