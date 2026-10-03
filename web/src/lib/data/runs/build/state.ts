import { contextOf, isInfluenced, uniqueLabels } from "../../labels/context";
import { between, randomHex, randomInt, type Rng } from "../../rng";
import { indexed, traceValue, type IndexedValue } from "../../values/content-index";
import type { Label, RunStatus, StepKind, ValueKind, ValueLabel } from "../../types";
import type { Step } from "../types";

// Steps the root-cause finder names. Scripts mark them; paths are built from them.
export type Mark = "entry" | "carry" | "turning" | "damage";

export type ValueSpec = { value: string; kind?: ValueKind };

// A value that went into a call. Kept raw only inside the data layer, for hashing.
export type RawArg = {
    stepId: string;
    agent: string;
    tool: string;
    name: string;
    raw: string;
    kind: ValueKind;
    label: Label;
    at: number;
};

export type ApprovalAnswer = "approve once" | "always approve" | "deny";

export type ApprovalRecord = {
    requestId: string;
    runId: string;
    stepId: string;
    agent: string;
    tool: string;
    answer: ApprovalAnswer;
    by: string;
    openedAt: number;
    decidedAt: number;
    argsHash: string;
    args: { name: string; value: string }[];
};

// Everything a run builder tracks while it writes steps.
export class BuildState {
    readonly steps: Step[] = [];
    readonly marks: { role: Mark; stepId: string }[] = [];
    readonly index: IndexedValue[] = [];
    readonly rawArgs: RawArg[] = [];
    readonly approvals: ApprovalRecord[] = [];
    // Agent to the agent that delegated to it.
    readonly parents = new Map<string, string | null>();
    // Agent to the step that started its work in this run.
    readonly session = new Map<string, string | null>();
    readonly lastModel = new Map<string, string>();
    readonly toolCalls = new Map<string, number>();
    readonly handoffs = new Map<string, number>();
    paidTodayEur = 0;
    ending: RunStatus | null = null;
    clock: number;
    private readonly read = new Map<string, Label[]>();
    private readonly ids = new Set<string>();

    constructor(
        readonly runId: string,
        readonly rng: Rng,
        readonly startedAt: number,
    ) {
        this.clock = startedAt;
    }

    newId(): string {
        let id = randomHex(this.rng, 16);
        while (this.ids.has(id)) id = randomHex(this.rng, 16);
        this.ids.add(id);
        return id;
    }

    wait(ms: number): void {
        this.clock += Math.max(0, Math.round(ms));
    }

    // Moves the clock forward to a fixed time, never back.
    jump(time: number): void {
        this.clock = Math.max(this.clock, time);
    }

    int(min: number, max: number): number {
        return randomInt(this.rng, min, max);
    }

    float(min: number, max: number): number {
        return between(this.rng, min, max);
    }

    see(agent: string, labels: Label[]): void {
        this.read.set(agent, uniqueLabels([...this.readBy(agent), ...labels]));
    }

    readBy(agent: string): Label[] {
        return this.read.get(agent) ?? [];
    }

    context(agent: string): Label {
        return contextOf(this.readBy(agent));
    }

    remember(values: ValueSpec[], label: Label, stepId: string, agent: string, at = this.clock): void {
        for (const spec of values) this.index.push(indexed(spec.value, spec.kind, label, stepId, agent, at));
    }

    trace(raw: string, kind?: ValueKind): ValueLabel {
        return traceValue(this.index, raw, kind);
    }

    // Appends a step with the agent's current context. Kind-specific fields start empty.
    step(agent: string, kind: StepKind, name: string, parentId: string | null, durationMs: number, at = this.clock) {
        const context = this.context(agent);
        const step: Step = {
            id: this.newId(),
            parentId,
            agent,
            kind,
            name,
            startedAt: at,
            durationMs: Math.max(0, Math.round(durationMs)),
            status: "ok",
            context,
            influenced: isInfluenced(context),
            detail: "",
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
        this.steps.push(step);
        return step;
    }

    mark(role: Mark, stepId: string): void {
        this.marks.push({ role, stepId });
    }

    // How deep an agent sits under the root: the root is 0.
    depthOf(agent: string): number {
        let depth = 0;
        let parent = this.parents.get(agent) ?? null;
        while (parent && depth < 20) {
            depth += 1;
            parent = this.parents.get(parent) ?? null;
        }
        return depth;
    }

    childrenOf(agent: string): number {
        return [...this.parents.values()].filter((parent) => parent === agent).length;
    }

    // Counts a call of this tool in the run and returns the new count.
    countCall(tool: string): number {
        const next = (this.toolCalls.get(tool) ?? 0) + 1;
        this.toolCalls.set(tool, next);
        return next;
    }

    // The step a new call of this agent hangs under.
    parentFor(agent: string): string | null {
        return this.lastModel.get(agent) ?? this.session.get(agent) ?? null;
    }
}
