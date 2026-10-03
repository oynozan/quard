// @vitest-environment node
import { describe, expect, it } from "vitest";
import { runDetailOf } from "../../runs/live/detail";
import type { RunDetail, Step } from "../../runs/types";
import { M1, M2, RUN, T1, T2, at, storedRun } from "../../../../../test/runs-fixture";
import { influencePath } from "./influence";

const now = at(30).getTime();

function stepOf(run: RunDetail, id: string): Step {
    return run.steps.find((step) => step.id === id)!;
}

// The payment, with every traced value said to come from this origin
function tracedTo(call: Step, origin: string): Step {
    return {
        ...call,
        args: call.args.map((arg) => ({
            ...arg,
            valueLabel: {
                ...arg.valueLabel,
                appearances: arg.valueLabel.appearances.map((seen) => ({ ...seen, label: { ...seen.label, origin } })),
            },
        })),
    };
}

// The run with the fetched page's output under another origin
function fetchedFrom(origin: string): RunDetail {
    const run = runDetailOf(storedRun(), now);
    const steps = run.steps.map((step) =>
        step.id === T1 && step.output
            ? { ...step, output: { ...step.output, label: { ...step.output.label, origin } } }
            : step,
    );
    return { ...run, steps };
}

const shape = (path: ReturnType<typeof influencePath>) => path.map((node) => [node.kind, node.title, node.detail]);

describe("influencePath", () => {
    it("runs from the page that brought the value, through the model call that asked, to the call", () => {
        const run = runDetailOf(storedRun(), now);
        const path = influencePath(run, stepOf(run, T2));

        expect(shape(path)).toEqual([
            ["origin", "acme-billing.net", "fetchPage · flag: instructions, invisible_text"],
            ["agent", "billing", "Asked for payInvoice"],
            ["call", "payInvoice", "iban GB33…5555"],
        ]);
        expect(path.map((node) => node.stepId)).toEqual([T1, M2, T2]);
        expect(path.every((node) => node.runId === RUN && node.role === null)).toBe(true);
        expect(path[0].label).toEqual({ origin: "web:acme-billing.net", trust: "untrusted", sensitivity: "public" });
    });

    it("starts at the user's message when the value came from the user", () => {
        // Without the system prompt, the user's message is all the first model call read
        const stored = storedRun();
        const run = runDetailOf({ ...stored, labels: stored.labels.filter((label) => label.origin !== "system") }, now);
        const path = influencePath(run, stepOf(run, T1));

        // The model call that read the message also asked for the call, so it shows once
        expect(shape(path)).toEqual([
            ["origin", "user", "The user's message"],
            ["call", "fetchPage", "url https://acme-billing.net/invoices/114"],
        ]);
        expect(path[0].stepId).toBe(M1);
    });

    it("says when the source guard never saw the output, and shows a clean scan as its outcome", () => {
        const run = runDetailOf(storedRun(), now);
        const isPageScan = (step: Step) => step.parentId === T1 && step.guard?.guard === "source";
        const unscanned = { ...run, steps: run.steps.filter((step) => !isPageScan(step)) };
        const clean = {
            ...run,
            steps: run.steps.map((step) =>
                isPageScan(step) && step.guard
                    ? { ...step, guard: { ...step.guard, outcome: "pass" as const, scan: null } }
                    : step,
            ),
        };

        expect(influencePath(unscanned, stepOf(run, T2))[0].detail).toBe("fetchPage · not scanned");
        expect(influencePath(clean, stepOf(run, T2))[0].detail).toBe("fetchPage · pass");
    });

    it("names hosted web search, and keeps an origin with no detail as it is", () => {
        const titleOf = (origin: string) => {
            const run = fetchedFrom(origin);
            return influencePath(run, tracedTo(stepOf(run, T2), origin))[0].title;
        };

        expect(titleOf("search:openai")).toBe("Hosted web search");
        expect(titleOf("mcp")).toBe("mcp");
        expect(titleOf("mcp:")).toBe("mcp:");
    });

    it("skips values an agent passed on, and blames the call's context instead", () => {
        const run = runDetailOf(storedRun(), now);
        const path = influencePath(run, tracedTo(stepOf(run, T2), "agent:planner"));

        expect(path.map((node) => node.stepId)).toEqual([T1, M2, T2]);
    });

    it("is only the call when the run does not hold where its content came in", () => {
        const run = runDetailOf(storedRun(), now);
        // The first model call read the system prompt before the user's message
        expect(influencePath(run, stepOf(run, T1)).map((node) => node.kind)).toEqual(["call"]);

        const call = { ...stepOf(run, T2), error: "The tool failed." };
        const bare = { ...run, steps: run.steps.filter((step) => step.id !== T1) };

        expect(shape(influencePath(bare, call))).toEqual([["call", "payInvoice", "iban GB33…5555 · The tool failed."]]);
    });

    it("leaves out the asker when the run does not hold it", () => {
        const run = runDetailOf(storedRun(), now);
        const bare = { ...run, steps: run.steps.filter((step) => step.id !== M2) };

        expect(influencePath(bare, stepOf(run, T2)).map((node) => node.stepId)).toEqual([T1, T2]);
    });
});
