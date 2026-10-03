import { describe, expect, it } from "vitest";
import { ASK, at, REQUEST, runWaiter, storedWaitingRun, T2 } from "../../../../../test/runs-fixture";
import { EMPTY_CONTEXT } from "../../labels/context";
import { buildSteps } from "./steps";

describe("buildSteps with calls that wait for a person", () => {
    it("adds a waiting call as an approval step under it, from its first check until now", () => {
        const steps = buildSteps(storedWaitingRun(), [runWaiter()], at(66).getTime());

        expect(steps.find((step) => step.kind === "approval")).toEqual({
            id: ASK,
            parentId: T2,
            agent: "billing",
            kind: "approval",
            name: "payInvoice",
            startedAt: at(6).getTime(),
            durationMs: 60_000,
            status: "waiting",
            context: { origin: "web:acme-billing.net", trust: "untrusted", sensitivity: "internal" },
            influenced: true,
            detail: "",
            args: [],
            output: null,
            model: null,
            guard: null,
            link: null,
            memory: null,
            approval: { requestId: REQUEST, state: "waiting", by: null, decidedAt: null, argsHash: "c".repeat(32) },
            hosted: false,
            error: null,
        });
        // It comes right after the checks of its call
        expect(steps.slice(-2).map((step) => step.guard?.guard ?? step.kind)).toEqual(["source", "approval"]);
    });

    it("starts a waiting call when it asked while none of its checks has arrived yet", () => {
        const waiter = runWaiter({ stepId: "c".repeat(16), since: at(8) });
        const [step] = buildSteps({ steps: [], labels: [], decisions: [] }, [waiter], at(7).getTime());

        // A server clock behind the database never makes the wait negative
        expect(step).toMatchObject({ parentId: "c".repeat(16), startedAt: at(8).getTime(), durationMs: 0 });
        expect(step).toMatchObject({ context: EMPTY_CONTEXT, influenced: false });
    });

    it("adds nothing without waiting calls", () => {
        expect(buildSteps(storedWaitingRun())).toEqual(buildSteps(storedWaitingRun(), [], at(66).getTime()));
        expect(buildSteps(storedWaitingRun()).some((step) => step.approval !== null)).toBe(false);
    });
});
