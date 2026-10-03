import { describe, expect, it } from "vitest";
import { ASK, at, CHILD, M1, M2, REQUEST, runWaiter, storedWaitingRun, T1, T2 } from "../../../../../test/runs-fixture";
import { EMPTY_CONTEXT } from "../../labels/context";
import { buildSteps } from "./steps";

describe("buildSteps with calls that wait for a person", () => {
    it("adds a waiting call as an approval step under it, from its last check until now", () => {
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

    it("starts a wait at the ask, after the checks that land a few ms after the call's permission", () => {
        const run = storedWaitingRun();
        const [permission, scan, action, , ask] = run.decisions;
        const start = at(6).getTime();
        const later = (ms: number) => new Date(start + ms);
        // The SDK stores a call's permission first, then its other checks and the ask
        run.decisions = [
            permission!,
            scan!,
            { ...permission!, eventId: "e00000000000000a", stepId: T2, tool: "payInvoice", at: later(0) },
            { ...action!, decision: "allow", reason: null, field: null, at: later(1) },
            { ...ask!, at: later(2) },
        ];
        const steps = buildSteps(run, [runWaiter()], at(66).getTime());

        expect(steps.map((step) => step.guard?.outcome ?? step.id)).toEqual([
            M1,
            T1,
            "flag",
            M2,
            CHILD,
            "allow",
            "ask",
            ASK,
        ]);
        expect(steps.at(-1)).toMatchObject({ kind: "approval", startedAt: start + 2, durationMs: 59_998 });
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
