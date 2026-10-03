// @vitest-environment node
import { describe, expect, it } from "vitest";
import { runDetailOf } from "../../runs/live/detail";
import type { RunDetail, Step } from "../../runs/types";
import { M2, RUN, T1, T2, at, storedRun } from "../../../../../test/runs-fixture";
import { openItem } from "../../../../../test/approvals-overview/items";
import { parseArgs } from "./args";
import { callOf, checksOf, pathOf } from "./path";

const now = at(30).getTime();
const item = openItem();
const args = parseArgs(item);

// The run while the payment waits: every check is stored, the tool_call is not sent yet
function waitingRun(): RunDetail {
    const stored = storedRun();
    return runDetailOf({ ...stored, steps: stored.steps.filter((step) => step.stepId !== T2) }, now);
}

// A run with only the steps given, for the cases the stored run cannot show
function runOf(steps: Step[]): RunDetail {
    const run = waitingRun();
    return { ...run, steps };
}

describe("callOf", () => {
    it("uses the stored tool call once it was sent", () => {
        const run = runDetailOf(storedRun(), now);
        expect(callOf(run, item, args)).toBe(run.steps.find((step) => step.id === T2));
    });

    it("rebuilds a waiting call after the model call that asked for it", () => {
        const run = waitingRun();
        const call = callOf(run, item, args);
        expect(call).toMatchObject({
            id: T2,
            parentId: M2,
            agent: "billing",
            kind: "tool_call",
            name: "payInvoice",
            startedAt: at(6).getTime(),
            status: "waiting",
            influenced: true,
        });
        expect(call.context).toEqual(run.steps.find((step) => step.id === M2)?.context);
        const [iban, amount] = call.args;
        expect(iban).toMatchObject({ name: "iban", value: "GB33…5555", masked: true });
        expect(iban.valueLabel).toEqual({
            kind: "iban",
            traced: true,
            generated: false,
            appearances: [
                {
                    label: { origin: "web:acme-billing.net", trust: "untrusted", sensitivity: "public" },
                    stepId: T1,
                    agent: "billing",
                    at: run.steps.find((step) => step.id === T1)?.startedAt,
                    match: "exact",
                },
            ],
        });
        expect(amount).toMatchObject({ value: "4950", masked: false, valueLabel: { kind: "text", traced: false } });
    });

    it("falls back to the request when the run holds no checks or asker yet", () => {
        const model = { ...waitingRun().steps.find((step) => step.id === M2)!, model: null };
        const call = callOf(runOf([model]), item, args);
        expect(call).toMatchObject({ parentId: null, startedAt: at(6).getTime() });
        expect(call.context).toEqual({ origin: "web:acme-billing.net", trust: "untrusted", sensitivity: "internal" });
        // An origin step the run does not hold yet is dated from the request
        expect(call.args[0].valueLabel.appearances[0]).toMatchObject({ agent: "billing", at: at(6).getTime() });
    });

    it("picks the context origin a reader would blame", () => {
        const context = (fields: Partial<typeof item.context>) =>
            callOf(runOf([]), openItem({ context: { ...item.context, ...fields } }), args).context.origin;
        expect(context({ origins: ["user", "email:inbound"] })).toBe("email:inbound");
        expect(context({ origins: ["user"] })).toBe("user");
        expect(context({ trust: "trusted", origins: ["tool:lookup", "web:acme.com"] })).toBe("tool:lookup");
        expect(context({ origins: [] })).toBe("instructions");
    });

    it("names a value type it does not know as an id", () => {
        const odd = parseArgs({
            args: { ref: "X-1" },
            masked: { ref: "X-1" },
            labels: [{ path: "ref", values: [{ type: "token", generated: true, origins: [] }] }],
        });
        expect(callOf(runOf([]), item, odd).args[0].valueLabel).toMatchObject({ kind: "id", generated: true });
    });
});

describe("pathOf", () => {
    it("runs from the web page through the agent that read it to the waiting call", () => {
        const path = pathOf(waitingRun(), item, args);
        expect(path.map((node) => [node.kind, node.title])).toEqual([
            ["origin", "acme-billing.net"],
            ["agent", "billing"],
            ["call", "payInvoice"],
        ]);
        expect(path.every((node) => node.runId === RUN)).toBe(true);
        expect(path[0].label.trust).toBe("untrusted");
    });

    it("is empty until the run arrives", () => {
        expect(pathOf(null, item, args)).toEqual([]);
    });
});

describe("checksOf", () => {
    it("lists the call's guard checks with their reasons in words", () => {
        const checks = checksOf(waitingRun(), item);
        expect(checks.map((check) => [check.guard, check.rule, check.outcome, check.reason])).toEqual([
            ["action", "iban:from", "block", "Value not from allowed origin"],
            ["limit", "max-calls-per-run", "block", ""],
            ["approval", "approval", "ask", "payInvoice asks a human first"],
            ["source", "source", "pass", ""],
        ]);
    });

    it("is empty until the run arrives", () => {
        expect(checksOf(null, item)).toEqual([]);
    });
});
