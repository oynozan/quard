// @vitest-environment node
import { addWaiter, openApprovalRequest } from "@quard/db";
import { describe, expect, it, vi } from "vitest";
import { ASKED_STEP, askInput } from "../../../../test/approvals-overview/live";
import { found, setUpSearchDb } from "../../../../test/search/db";
import {
    agentRun,
    CARD,
    DOCS_RUN,
    docsRun,
    EMAIL,
    FILE,
    IBAN,
    INVOICE_ID,
    INVOICE_RUN,
    invoiceRun,
    READ,
    T0,
} from "../../../../test/search/events";
import { database } from "@/lib/data/runs/live/client";
import { searchRuns } from "@/lib/data/search";

const requireSession = vi.hoisted(() => vi.fn(async () => ({ sub: "did:privy:1", email: null, github: null, exp: 0 })));
vi.mock("@/lib/auth/session", () => ({ requireSession }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const project = setUpSearchDb();
const at = (seconds: number) => T0 + seconds * 1000;

describe("searchRuns before there is anything to search", () => {
    it("has no runs before a project exists", async () => {
        expect(await searchRuns("billing")).toEqual({ state: "no-runs" });
        expect(requireSession).toHaveBeenCalled();
    });

    it("has no runs in a new project, whatever other projects hold", async () => {
        await project(...invoiceRun());
        await project();

        expect(await searchRuns("")).toEqual({ state: "no-runs" });
        expect(await searchRuns("billing")).toEqual({ state: "no-runs" });
    });

    it("waits for a query once the project has runs", async () => {
        await project(...invoiceRun());

        expect(await searchRuns("   ")).toEqual({ state: "idle" });
    });
});

describe("searchRuns by name", () => {
    it("finds an agent in any case, at its first step in each run", async () => {
        await project(...invoiceRun(), ...docsRun());

        expect(await found(" BILLING ")).toEqual({
            query: "BILLING",
            kind: "agent",
            byHash: false,
            shown: "BILLING",
            matches: [
                {
                    runId: INVOICE_RUN,
                    stepId: READ,
                    agent: "billing",
                    tool: "",
                    field: "agent",
                    value: "billing",
                    label: null,
                    at: at(2),
                    match: "name",
                },
            ],
            runRows: [expect.objectContaining({ id: INVOICE_RUN, rootAgent: "billing", status: "completed" })],
            total: 1,
            runs: 1,
            truncated: false,
        });
    });

    it("finds a tool where it was called", async () => {
        await project(...invoiceRun(), ...docsRun());

        const result = await found("readfile");

        expect(result).toMatchObject({ kind: "tool", byHash: false, shown: "readfile", total: 1, runs: 1 });
        expect(result.matches).toEqual([
            {
                runId: DOCS_RUN,
                stepId: FILE,
                agent: "researcher",
                tool: "readFile",
                field: "tool",
                value: "readFile",
                label: null,
                at: at(13),
                match: "name",
            },
        ]);
    });

    it("prefers an agent over a tool of the same name", async () => {
        const other = "e".repeat(32);
        await project(...docsRun(), ...agentRun(other, "readFile"));

        const result = await found("readFile");

        expect(result).toMatchObject({ kind: "agent", total: 1, runs: 1 });
        expect(result.matches.map(({ runId, field }) => ({ runId, field }))).toEqual([
            { runId: other, field: "agent" },
        ]);
    });

    it("lists the newest 50 runs of an agent and says there are more", async () => {
        const runs = Array.from({ length: 51 }, (_, n) => agentRun((n + 1).toString(16).padStart(32, "a"), "billing"));
        await project(...runs.flat());

        const result = await found("billing");

        expect(result).toMatchObject({ kind: "agent", total: 51, runs: 51, truncated: true });
        expect(result.matches).toHaveLength(50);
        expect(result.runRows).toHaveLength(50);
    });
});

describe("searchRuns on a run that waits for a person", () => {
    it("shows the run as waiting while its call waits on an open request", async () => {
        const runId = "f".repeat(32);
        const asking = agentRun(runId, "billing").filter((event) => event.type !== "run_finished");
        const projectId = await project(...asking);
        const { id } = await openApprovalRequest(database(), projectId, askInput(runId));
        const ask = { askId: "a".repeat(16), requestId: id, runId, stepId: ASKED_STEP, agent: "billing" };
        await addWaiter(database(), projectId, ask);

        expect((await found("billing")).runRows).toEqual([
            expect.objectContaining({ id: runId, status: "waiting", approvalId: id }),
        ]);
    });
});

describe("searchRuns when a query cannot be searched", () => {
    it("says when a query is no value and no name", async () => {
        await project(...invoiceRun());

        expect(await searchRuns("hello world")).toEqual({ state: "nothing" });
    });

    it("refuses card numbers, which have no stored key", async () => {
        await project(...invoiceRun());

        expect(await searchRuns(CARD)).toEqual({ state: "card" });
    });

    it("turns IBAN and email search off without the hash key, keeping clear values", async () => {
        await project(...invoiceRun());
        vi.stubEnv("QUARD_HASH_KEY", "");

        expect(await searchRuns(IBAN)).toEqual({ state: "hash-off" });
        expect(await searchRuns(EMAIL)).toEqual({ state: "hash-off" });
        expect((await found(INVOICE_ID)).total).toBe(2);
    });

    it("fails on a hash key that is not 64 hex characters", async () => {
        await project(...invoiceRun());
        vi.stubEnv("QUARD_HASH_KEY", "short");

        await expect(searchRuns(IBAN)).rejects.toThrow("64 hex characters");
    });

    it("stops at the sign-in redirect for people who are not signed in", async () => {
        requireSession.mockRejectedValueOnce(new Error("redirect:/sign-in"));

        await expect(searchRuns("billing")).rejects.toThrow("redirect:/sign-in");
    });
});
