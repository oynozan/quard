import type { RunDetail, Step } from "../../runs/types";
import type { PathNode } from "../../types";

// "web:acme.com" reads as "acme.com". An origin with nothing after its kind keeps its name.
export function originTitle(origin: string): string {
    if (origin.startsWith("search:")) return "Hosted web search";
    const detail = origin.slice(origin.indexOf(":") + 1);
    return detail || origin;
}

// What the source guard made of a tool's output
function scanWords(run: RunDetail, step: Step): string {
    const check = run.steps.find((item) => item.parentId === step.id && item.guard?.guard === "source")?.guard;
    if (!check) return "not scanned";
    const findings = check.scan?.findings ?? [];
    return findings.length > 0 ? `${check.outcome}: ${findings.join(", ")}` : check.outcome;
}

export function nodeOf(run: RunDetail, step: Step): PathNode {
    const base = { role: null, agent: step.agent, runId: run.summary.id, stepId: step.id, at: step.startedAt };
    if (step.kind === "model_call") {
        return { ...base, kind: "agent", title: step.agent, detail: step.detail, label: step.context };
    }
    const detail = step.error ? `${step.detail} · ${step.error}` : step.detail;
    return { ...base, kind: "call", title: step.name, detail, label: step.context };
}

// This step as where content with this origin came in, if it holds such content
function cameInAt(run: RunDetail, step: Step, origin: string): PathNode | null {
    if (origin === "user") {
        if (step.kind !== "model_call") return null;
        return { ...nodeOf(run, step), kind: "origin", title: "user", detail: "The user's message" };
    }
    if (step.output?.label.origin !== origin) return null;
    return {
        ...nodeOf(run, step),
        kind: "origin",
        title: originTitle(origin),
        detail: `${step.name} · ${scanWords(run, step)}`,
        label: step.output.label,
    };
}

// Where content with this origin came in: the given step if it holds it, else the
// first step that does (the user's message or a tool's output)
export function originNode(run: RunDetail, origin: string, stepId?: string): PathNode | null {
    const given = run.steps.find((item) => item.id === stepId);
    const node = given && cameInAt(run, given, origin);
    if (node) return node;
    const holds = (item: Step) =>
        origin === "user"
            ? item.kind === "model_call" && item.context.origin === "user"
            : item.output?.label.origin === origin;
    const step = run.steps.find(holds);
    return step ? cameInAt(run, step, origin) : null;
}

// How content reached a call: where it came in, the model call that asked, then the call.
// Stored runs hold no handoffs or memory yet, so the path has no carriers.
export function influencePath(run: RunDetail, call: Step): PathNode[] {
    // Untrusted content in the arguments first, else where any traced value came from
    const seen = call.args
        .flatMap((arg) => arg.valueLabel.appearances)
        .filter((appearance) => !appearance.label.origin.startsWith("agent:"));
    const picked = seen.find((appearance) => appearance.label.trust === "untrusted") ?? seen[0];
    const origin = originNode(run, picked?.label.origin ?? call.context.origin);
    if (!origin) return [nodeOf(run, call)];
    const asker = run.steps.find((step) => step.id === call.parentId && step.kind === "model_call");
    const nodes = [origin];
    if (asker && asker.id !== origin.stepId) nodes.push(nodeOf(run, asker));
    return [...nodes, nodeOf(run, call)];
}
