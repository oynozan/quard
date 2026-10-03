import { createRng, NOW, seedFrom } from "../../rng";
import { modelCall, toolCall, type ModelOptions, type ToolOptions } from "./calls";
import { delegateTo, memoryStep, sendMessage, type Content, type LinkOptions, type MemoryOptions } from "./links";
import { BuildState, type ApprovalRecord, type Mark, type RawArg } from "./state";
import type { IndexedValue } from "../../values/content-index";
import type { RunStatus } from "../../types";
import type { Step } from "../types";

// A finished run: its steps plus what the rest of the data layer needs from it.
export type BuiltRun = {
    runId: string;
    startedAt: number;
    status: RunStatus;
    steps: Step[];
    marks: { role: Mark; stepId: string }[];
    rawArgs: RawArg[];
    index: IndexedValue[];
    approvals: ApprovalRecord[];
    parents: [string, string | null][];
};

// Writes one run step by step, like a script. Seeded from the run id.
export class RunBuilder extends BuildState {
    constructor(runId: string, startedAt: number) {
        super(runId, createRng(seedFrom(runId)), startedAt);
    }

    model(agent: string, opts?: ModelOptions) {
        return modelCall(this, agent, opts);
    }

    tool(agent: string, name: string, opts: ToolOptions) {
        return toolCall(this, agent, name, opts);
    }

    delegate(from: string, to: string, brief: Content, opts?: LinkOptions) {
        return delegateTo(this, from, to, brief, opts);
    }

    message(from: string, to: string, content: Content, mark?: Mark) {
        return sendMessage(this, from, to, content, mark);
    }

    memory(agent: string, op: "read" | "write", store: string, key: string, opts?: MemoryOptions) {
        return memoryStep(this, agent, op, store, key, opts);
    }

    end(status: RunStatus) {
        this.ending = status;
    }

    // Sorts the steps and cuts the run at NOW. A cut run is still running.
    finish(): BuiltRun {
        const ordered = this.steps
            .map((step, order) => ({ step, order }))
            .sort((a, b) => a.step.startedAt - b.step.startedAt || a.order - b.order)
            .map((entry) => entry.step);
        let status: RunStatus = this.ending ?? "completed";
        let cut = false;
        const steps: Step[] = [];
        for (const step of ordered) {
            if (step.startedAt > NOW) {
                cut = true;
                continue;
            }
            if (step.status === "waiting") {
                step.durationMs = NOW - step.startedAt;
            } else if (step.startedAt + step.durationMs > NOW) {
                step.durationMs = NOW - step.startedAt;
                step.status = "running";
                cut = true;
            }
            steps.push(step);
        }
        if (cut && status !== "waiting") status = "running";
        const kept = new Set(steps.map((step) => step.id));
        return {
            runId: this.runId,
            startedAt: this.startedAt,
            status,
            steps,
            marks: this.marks.filter((mark) => kept.has(mark.stepId)),
            rawArgs: this.rawArgs.filter((arg) => kept.has(arg.stepId)),
            index: this.index.filter((value) => kept.has(value.stepId)),
            approvals: this.approvals.filter((record) => kept.has(record.stepId) && record.decidedAt <= NOW),
            parents: [...this.parents.entries()],
        };
    }
}
