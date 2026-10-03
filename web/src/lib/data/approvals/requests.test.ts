// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogRun, type CatalogRun } from "../runs/catalog";
import { DEPLOY_RUN_ID } from "../runs/scripts/approval-runs";
import { STORY_RUN_ID } from "../runs/scripts/story";
import { openApprovals, openCall, openIds, requestOf } from "./requests";

const data = vi.hoisted(() => ({ runs: new Map<string, CatalogRun | null>() }));

vi.mock("../runs/catalog", async (importOriginal) => {
    const real = await importOriginal<typeof import("../runs/catalog")>();
    const catalogRun = (id: string) => (data.runs.has(id) ? data.runs.get(id)! : real.catalogRun(id));
    return { ...real, catalogRun };
});

afterEach(() => data.runs.clear());

// A copy of a listed run that a test may change.
function copyOf(runId: string): CatalogRun {
    const copy = structuredClone(catalogRun(runId)!);
    data.runs.set(runId, copy);
    return copy;
}

describe("openIds", () => {
    it("lists open requests newest first", () => {
        expect(openIds()).toEqual(["apr_7f31", "apr_7f2c", "apr_7f1e", "apr_7f0a"]);
    });
});

describe("openCall", () => {
    it("finds the call that asked and its approval step in the run that asked first", () => {
        const open = openCall("apr_7f31")!;

        expect(open.spec.runId).toBe(STORY_RUN_ID);
        expect(open.run.detail.summary.id).toBe(STORY_RUN_ID);
        expect(open.approval.approval?.requestId).toBe("apr_7f31");
        expect(open.approval.parentId).toBe(open.call.id);
        expect(open.call.name).toBe("pay_invoice");
    });

    it("gives nothing for a request that is not open", () => {
        expect(openCall("apr_0000")).toBeNull();
    });

    it("gives nothing when the run that asked is gone", () => {
        data.runs.set(DEPLOY_RUN_ID, null);

        expect(openCall("apr_7f1e")).toBeNull();
    });

    it("gives nothing when the run has no approval step for the request", () => {
        for (const step of copyOf(STORY_RUN_ID).detail.steps) step.approval = null;

        expect(openCall("apr_7f31")).toBeNull();
    });
});

describe("requestOf", () => {
    it("shows the approver the full argument values and where each came from", () => {
        const request = requestOf(openCall("apr_7f31")!);

        expect(request).toMatchObject({
            id: "apr_7f31",
            runId: STORY_RUN_ID,
            agent: "billing",
            tool: "pay_invoice",
            reason: "pay_invoice always asks a human first",
            waiting: true,
        });
        expect(request.args.map((arg) => [arg.name, arg.value, arg.traced])).toEqual([
            ["iban", "DE89 3704 0044 0532 0130 00", true],
            ["amount", "4,950.00 EUR", false],
            ["reference", "INV-20931", true],
        ]);
        expect(request.args[0].origins.map((label) => label.origin)).toEqual([
            "web:supplier-portal.example",
            "agent:researcher",
        ]);
    });

    it("takes the reason from the guard that asked", () => {
        expect(requestOf(openCall("apr_7f2c")!).reason).toBe(
            "Recipient first appeared in outside email (claims-desk.io)",
        );
    });

    it("marks values the model made up, and stops waiting once the heartbeat stops", () => {
        const request = requestOf(openCall("apr_7f1e")!);

        expect(request.waiting).toBe(false);
        expect(request.args.filter((arg) => arg.generated).map((arg) => arg.name)).toEqual(["commit"]);
        expect(request.args.find((arg) => arg.name === "service")).not.toHaveProperty("generated");
    });

    it("falls back to the masked value when no full value was kept", () => {
        copyOf(STORY_RUN_ID).built.rawArgs.length = 0;

        expect(requestOf(openCall("apr_7f31")!).args[0].value).toBe("DE89…3000");
    });

    it("gives a plain reason when no enforced guard asked", () => {
        const run = copyOf(STORY_RUN_ID);
        for (const step of run.detail.steps) if (step.guard?.outcome === "ask") step.guard.mode = "observe";

        expect(requestOf(openCall("apr_7f31")!).reason).toBe("pay_invoice asks a human first");
    });
});

describe("openApprovals", () => {
    it("lists every open request as the approver sees it", () => {
        expect(openApprovals().map((request) => request.id)).toEqual(openIds());
    });

    it("skips a request whose run is gone", () => {
        data.runs.set(DEPLOY_RUN_ID, null);

        expect(openApprovals().map((request) => request.id)).toEqual(["apr_7f31", "apr_7f2c", "apr_7f0a"]);
    });
});
