// @vitest-environment node
import { createHash } from "node:crypto";
import { addWaiter, createProject, ingestBatch, openApprovalRequest } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ASKED_STEP, askInput, waitingRun } from "../../../../test/approvals-overview/live";
import { at, attack, item, scoredFetch, signatureMatch } from "../../../../test/runs/events";

const requireSession = vi.hoisted(() => vi.fn(async () => ({ sub: "did:privy:1", email: null, github: null, exp: 0 })));
vi.mock("@/lib/auth/session", () => ({ requireSession }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const { getRun, listRuns } = await import("./query");
const { database } = await import("./live/client");

const RUN = "b".repeat(32);
const OTHER = "c".repeat(32);
const WAITING = "e".repeat(32);
let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
    vi.stubEnv("DATABASE_URL", test.url);
    vi.stubEnv("QUARD_PROJECT_ID", "");
}, 60_000);

afterAll(async () => {
    await database().destroy();
    vi.unstubAllEnvs();
    await test.stop();
});

describe("runs from Postgres", () => {
    it("shows nothing before a project exists", async () => {
        expect(await listRuns()).toEqual([]);
        expect(await getRun(RUN)).toBeNull();
    });

    it("lists the project's runs and opens one, traced and redacted", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [...attack(RUN, "billing"), ...attack(OTHER, "support", true)]);

        const rows = await listRuns();
        expect(rows.map((row) => row.id).sort()).toEqual([RUN, OTHER].sort());
        expect(rows.find((row) => row.id === OTHER)).toMatchObject({
            status: "completed",
            durationMs: 4000,
            costUsd: 0.003075,
            costKnown: true,
        });
        expect(rows.find((row) => row.id === RUN)).toMatchObject({
            status: "blocked",
            decisions: { blocked: 1 },
            tools: ["payInvoice"],
        });

        const run = await getRun(RUN);
        const pay = run?.steps.find((step) => step.kind === "tool_call");
        expect(pay?.args[0]).toMatchObject({ value: "GB33…5555", valueLabel: { kind: "iban", traced: true } });
        expect(pay?.args[0]?.valueLabel.appearances[0]?.label.origin).toBe("web:acme-billing.net");
        expect(requireSession).toHaveBeenCalled();
        expect(await getRun("f".repeat(32))).toBeNull();
    });

    it("links a run to the incident its blocked call opened", async () => {
        const projectId = await createProject(test.db, "Linked");
        vi.stubEnv("QUARD_PROJECT_ID", projectId);
        const QUIET = "d".repeat(32);
        await ingestBatch(test.db, projectId, [
            ...attack(RUN, "billing"),
            item({ type: "run_started", runId: QUIET, agent: "support", at: at(0), origins: {} }),
        ]);

        const id = `inc_${createHash("md5").update(`${projectId}:${RUN}`).digest("hex").slice(0, 16)}`;
        expect((await getRun(RUN))?.summary.incidentId).toBe(id);
        expect((await getRun(QUIET))?.summary.incidentId).toBeNull();
        vi.stubEnv("QUARD_PROJECT_ID", "");
    });

    it("filters by agent, status and words, and limits the list", async () => {
        expect((await listRuns({ agent: "support" })).map((row) => row.id)).toEqual([OTHER]);
        expect(await listRuns({ status: "running" })).toEqual([]);
        expect((await listRuns({ query: "SUPPORT pay" })).map((row) => row.id)).toEqual([OTHER]);
        expect((await listRuns({ query: "bbbb" })).map((row) => row.id)).toEqual([RUN]);
        expect(await listRuns({ limit: 1 })).toHaveLength(1);
    });

    it("counts a signature from the feed the same in the list and in the run", async () => {
        const projectId = await createProject(test.db, "Signatures");
        vi.stubEnv("QUARD_PROJECT_ID", projectId);
        await ingestBatch(test.db, projectId, [...attack(RUN, "billing"), ...signatureMatch(RUN, "billing")]);

        const [row] = await listRuns();
        const run = await getRun(RUN);
        vi.stubEnv("QUARD_PROJECT_ID", "");
        const blocked = { allowed: 0, asked: 0, blocked: 2 };
        expect(row).toMatchObject({ steps: 4, decisions: blocked });
        expect(run?.summary).toMatchObject({ steps: 4, decisions: blocked });
        expect(run?.steps.find((step) => step.guard?.guard === "signature")).toMatchObject({
            name: "PROMPT-INJECTION-1",
            status: "blocked",
        });
    });

    it("says which decisions came late and keeps a detector's score", async () => {
        const projectId = await createProject(test.db, "Scored");
        vi.stubEnv("QUARD_PROJECT_ID", projectId);
        await ingestBatch(test.db, projectId, [...attack(RUN, "billing"), ...scoredFetch(RUN, "billing")]);

        const checks = (await getRun(RUN))?.steps.flatMap((step) => (step.guard ? [step.guard] : []));
        vi.stubEnv("QUARD_PROJECT_ID", "");
        expect(checks?.map((guard) => [guard.guard, guard.degraded, guard.scan?.jevScore])).toEqual([
            ["action", false, undefined],
            ["source", true, 0.87],
        ]);
    });
});

describe("runs that wait for a person", () => {
    it("shows a run as waiting while its call waits on an open request, and filters by it", async () => {
        const projectId = await createProject(test.db, "Waiting");
        vi.stubEnv("QUARD_PROJECT_ID", projectId);
        // The run asked hours ago and has sent nothing since
        await ingestBatch(test.db, projectId, waitingRun(WAITING));
        const { id } = await openApprovalRequest(test.db, projectId, askInput(WAITING));
        const ask = { askId: "a".repeat(16), requestId: id, runId: WAITING, stepId: ASKED_STEP, agent: "billing" };
        await addWaiter(test.db, projectId, ask);

        expect(await listRuns()).toEqual([expect.objectContaining({ id: WAITING, status: "waiting", approvalId: id })]);
        expect((await listRuns({ status: "waiting" })).map((row) => row.id)).toEqual([WAITING]);
        expect(await listRuns({ status: "completed" })).toEqual([]);
        const run = await getRun(WAITING);
        expect(run?.summary).toMatchObject({ status: "waiting", approvalId: id });
        expect(run?.steps.at(-1)).toMatchObject({
            kind: "approval",
            name: "payInvoice",
            status: "waiting",
            approval: { requestId: id, state: "waiting" },
        });
    });

    it("judges the run as usual once its waiting process stops beating", async () => {
        await test.db
            .updateTable("approval_waiters")
            .set({ last_beat_at: new Date(Date.now() - 60_000) })
            .where("run_id", "=", WAITING)
            .execute();

        const [row] = await listRuns();
        expect(row).toMatchObject({ id: WAITING, status: "completed", approvalId: expect.stringMatching(/^apr_/) });
        expect(await listRuns({ status: "waiting" })).toEqual([]);
        const run = await getRun(WAITING);
        vi.stubEnv("QUARD_PROJECT_ID", "");
        expect(run?.summary).toMatchObject({ status: "completed", approvalId: row?.approvalId });
        expect(run?.steps.some((step) => step.approval)).toBe(false);
    });
});

describe("filters past the newest 200 runs", () => {
    // Runs with no events that start an hour after the others, one a minute
    async function addLaterRuns(projectId: string): Promise<void> {
        const rows = Array.from({ length: 200 }, (_, n) => ({
            project_id: projectId,
            run_id: (n + 1).toString(16).padStart(32, "0"),
            agent: "billing",
            started_at: new Date(Date.UTC(2026, 9, 3, 13, n)),
            last_event_at: new Date(Date.UTC(2026, 9, 3, 13, n)),
        }));
        await test.db.insertInto("runs").values(rows).execute();
    }

    it("lists an agent's runs however many runs started after them", async () => {
        const projectId = await createProject(test.db, "Busy");
        vi.stubEnv("QUARD_PROJECT_ID", projectId);
        await ingestBatch(test.db, projectId, attack(RUN, "audit"));
        await addLaterRuns(projectId);

        const all = await listRuns();
        const audit = await listRuns({ agent: "audit" });
        vi.stubEnv("QUARD_PROJECT_ID", "");
        expect(all).toHaveLength(200);
        expect(all.map((row) => row.id)).not.toContain(RUN);
        expect(audit.map((row) => row.id)).toEqual([RUN]);
    });

    it("lists a run that waits for a person however many runs started after it", async () => {
        const projectId = await createProject(test.db, "Busy and waiting");
        vi.stubEnv("QUARD_PROJECT_ID", projectId);
        await ingestBatch(test.db, projectId, waitingRun(WAITING));
        const { id } = await openApprovalRequest(test.db, projectId, askInput(WAITING));
        const ask = { askId: "f".repeat(16), requestId: id, runId: WAITING, stepId: ASKED_STEP, agent: "billing" };
        await addWaiter(test.db, projectId, ask);
        await addLaterRuns(projectId);

        const waiting = await listRuns({ status: "waiting" });
        vi.stubEnv("QUARD_PROJECT_ID", "");
        expect(waiting).toEqual([expect.objectContaining({ id: WAITING, status: "waiting", approvalId: id })]);
    });
});
