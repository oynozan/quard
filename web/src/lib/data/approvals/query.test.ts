// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { influencePath } from "../paths/build";
import { catalogRun, type CatalogRun } from "../runs/catalog";
import { DEPLOY_RUN_ID, REFUND_REPEAT_RUN_ID, REFUND_RUN_ID } from "../runs/scripts/approval-runs";
import { STORY_RUN_ID } from "../runs/scripts/story";
import { alwaysGrants, recentDecisions } from "./history";
import { getApproval, getApprovals } from "./query";
import { openIds } from "./requests";
import type { ApprovalArg } from "../types";

const data = vi.hoisted(() => ({
    runs: new Map<string, CatalogRun | null>(),
    extraArg: null as ApprovalArg | null,
}));

// Tests swap single runs; every other run stays as listed.
vi.mock("../runs/catalog", async (importOriginal) => {
    const real = await importOriginal<typeof import("../runs/catalog")>();
    const catalogRun = (id: string) => (data.runs.has(id) ? data.runs.get(id)! : real.catalogRun(id));
    const catalogRuns = () =>
        real.catalogRuns().flatMap((run) => {
            const swapped = catalogRun(run.detail.summary.id);
            return swapped ? [swapped] : [];
        });
    return { ...real, catalogRun, catalogRuns };
});

vi.mock("./requests", async (importOriginal) => {
    const real = await importOriginal<typeof import("./requests")>();
    const requestOf: typeof real.requestOf = (open) => {
        const request = real.requestOf(open);
        return data.extraArg ? { ...request, args: [...request.args, data.extraArg] } : request;
    };
    return { ...real, requestOf };
});

afterEach(() => {
    data.runs.clear();
    data.extraArg = null;
});

function copyOf(runId: string): CatalogRun {
    const copy = structuredClone(catalogRun(runId)!);
    data.runs.set(runId, copy);
    return copy;
}

describe("getApprovals", () => {
    it("gives the open requests, the always-approve grants and past answers", async () => {
        const approvals = await getApprovals();

        expect(approvals.open.map((detail) => detail.request.id)).toEqual(openIds());
        expect(approvals.grants).toEqual(alwaysGrants());
        expect(approvals.decisions).toEqual(recentDecisions());
    });

    it("skips an open request whose run is gone", async () => {
        data.runs.set(DEPLOY_RUN_ID, null);

        const approvals = await getApprovals();

        expect(approvals.open.map((detail) => detail.request.id)).toEqual(["apr_7f31", "apr_7f2c", "apr_7f0a"]);
    });
});

describe("getApproval", () => {
    it("gives nothing for a request that is not open", async () => {
        expect(await getApproval("apr_0000")).toBeNull();
    });

    it("shows each argument in full, masked, and where it appeared", async () => {
        const detail = (await getApproval("apr_7f31"))!;
        const [iban, amount] = detail.args;

        expect(iban).toMatchObject({
            value: "DE89 3704 0044 0532 0130 00",
            kind: "iban",
            traced: true,
            masked: "DE89…3000",
        });
        expect(iban.appearances.map((item) => item.label.origin)).toEqual([
            "web:supplier-portal.example",
            "agent:researcher",
        ]);
        expect(amount).toMatchObject({ kind: "amount", traced: false, masked: "4,950.00 EUR", appearances: [] });
    });

    it("shows the run, its live heartbeat and every guard result on the call", async () => {
        const detail = (await getApproval("apr_7f31"))!;
        const run = catalogRun(STORY_RUN_ID)!;
        const approval = run.detail.steps.find((step) => step.approval?.requestId === "apr_7f31")!;
        const call = run.detail.steps.find((step) => step.id === approval.parentId)!;

        expect(detail.run).toEqual(run.detail.summary);
        expect(detail.heartbeat.state).toBe("live");
        expect(detail.argsHash).toBe(approval.approval!.argsHash);
        expect(detail.context).toEqual(call.context);
        expect(detail.context.trust).toBe("untrusted");
        expect(detail.path).toEqual(influencePath(run.detail, call));
        expect(detail.path.length).toBeGreaterThan(0);
        expect(detail.decisions.map((decision) => [decision.guard, decision.outcome])).toEqual([
            ["limit", "allow"],
            ["limit", "allow"],
            ["action", "block"],
            ["approval", "ask"],
        ]);
        expect(detail).toMatchObject({ identicalWaiting: false, joined: [] });
    });

    it("lists identical calls from other runs that wait on the same request", async () => {
        const detail = (await getApproval("apr_7f2c"))!;
        const waiting = catalogRun(REFUND_REPEAT_RUN_ID)!.detail.steps.find(
            (step) => step.approval?.requestId === "apr_7f2c" && step.status === "waiting",
        )!;

        expect(detail.request.runId).toBe(REFUND_RUN_ID);
        expect(detail.identicalWaiting).toBe(true);
        expect(detail.joined).toEqual([
            { runId: REFUND_REPEAT_RUN_ID, stepId: waiting.parentId, agent: "support", since: waiting.startedAt },
        ]);
    });

    it("points a joined call at its own step when it has no parent call", async () => {
        const waiting = copyOf(REFUND_REPEAT_RUN_ID).detail.steps.find(
            (step) => step.approval?.requestId === "apr_7f2c" && step.status === "waiting",
        )!;
        waiting.parentId = null;

        const detail = (await getApproval("apr_7f2c"))!;

        expect(detail.joined.map((call) => call.stepId)).toEqual([waiting.id]);
    });

    it("shows an argument with no matching call argument as plain untraced text", async () => {
        data.extraArg = { name: "note", value: "Pay today", origins: [] };

        const detail = (await getApproval("apr_7f31"))!;

        expect(detail.args.at(-1)).toEqual({
            name: "note",
            value: "Pay today",
            origins: [],
            kind: "text",
            traced: false,
            masked: "Pay today",
            appearances: [],
        });
    });

    it("shows an empty hash when the approval step kept none", async () => {
        const approval = copyOf(STORY_RUN_ID).detail.steps.find((step) => step.approval?.requestId === "apr_7f31")!;
        delete (approval.approval as Partial<NonNullable<typeof approval.approval>>).argsHash;

        expect((await getApproval("apr_7f31"))!.argsHash).toBe("");
    });
});
