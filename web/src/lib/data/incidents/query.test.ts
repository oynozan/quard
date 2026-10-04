// @vitest-environment node
import { createProject, failFind, ingestBatch, saveReplay, saveReview, saveVerdict } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { storedReplay, storedVerdict } from "../../../../test/incidents/rows";
import { at, attack } from "../../../../test/runs/events";

const requireSession = vi.hoisted(() => vi.fn(async () => ({ sub: "did:privy:1", email: null, github: null, exp: 0 })));
const cache = vi.hoisted(() => vi.fn(<T>(fn: T) => fn));
vi.mock("@/lib/auth/session", () => ({ requireSession }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
vi.mock("react", async (original) => {
    const react = await original<typeof import("react")>();
    // React is CommonJS, so named imports can resolve through its default export
    return { ...react, default: { ...react, cache }, cache };
});

const { getIncident, listIncidents } = await import("./query");
const { database } = await import("../runs/live/client");
// Vitest clears call history before each test, so keep what the import wrapped
const cached = cache.mock.results.map((result) => result.value);

const [PAID, OPEN, FAILED] = ["b", "c", "d"].map((char) => char.repeat(32));
const [MODEL, PAY] = ["1", "2"].map((char) => char.repeat(16));
let test: TestDb;
let projectId = "";

// The stored attack's verdict: the page read by the model call held the IBAN payInvoice asked for
const VERDICT = (() => {
    const verdict = storedVerdict();
    return {
        ...verdict,
        entry: { ...verdict.entry, stepId: MODEL, at: at(1), contentId: "c1" },
        turning: { ...verdict.turning, stepId: MODEL, at: at(2) },
        damage: { ...verdict.damage, stepId: PAY, at: at(3) },
    };
})();

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

describe("incidents from Postgres", () => {
    it("shows nothing before a project exists", async () => {
        expect(await listIncidents()).toEqual([]);
        expect(await getIncident("inc_0123456789abcdef")).toBeNull();
    });

    it("lists every incident newest first, found or not, and limits the list", async () => {
        projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [
            ...attack(PAID, "billing"),
            ...attack(OPEN, "billing"),
            ...attack(FAILED, "billing"),
        ]);
        const ids = Object.fromEntries((await listIncidents()).map((row) => [row.runId, row.id]));
        await saveVerdict(test.db, projectId, ids[PAID], VERDICT);
        await failFind(test.db, projectId, ids[FAILED], "The blocked call's events never arrived");

        const list = await listIncidents();
        expect(list.map((row) => [row.runId, row.title, row.replay])).toEqual(
            expect.arrayContaining([
                [PAID, "payInvoice with input from acme-billing.net", "not started"],
                [OPEN, "Finding the root cause", "not started"],
                [FAILED, "Root cause not found", "not started"],
            ]),
        );
        expect(list).toHaveLength(3);
        expect(await listIncidents(1)).toHaveLength(1);
        expect(requireSession).toHaveBeenCalled();
    });

    it("opens a found incident with its path, replay, note and run", async () => {
        const [row] = (await listIncidents()).filter((item) => item.runId === PAID);
        const note = {
            model: "gpt-6.1-sol",
            costUsd: 0.001,
            writtenAt: at(5),
            paragraphs: ["The page held the IBAN."],
        };
        await saveReview(test.db, projectId, row.id, note, 0.001);
        const rounds = [
            {
                with: { runs: 5, harmful: 5 },
                without: { runs: 5, harmful: 0 },
                pValue: 0.004,
                costUsd: 0.02,
                finishedAt: at(9),
            },
        ];
        await saveReplay(test.db, projectId, row.id, storedReplay({ rounds, outcome: "confirmed" }), 0.021, "done");

        const detail = await getIncident(row.id);
        expect(detail?.incident).toEqual({ ...row, replay: "confirmed" });
        expect(detail?.run).toMatchObject({ id: PAID, status: "blocked" });
        expect(detail?.working).toBe(false);
        expect(detail?.findings?.path.map((node) => [node.role, node.title])).toEqual([
            ["entry", "acme-billing.net"],
            ["turning", "billing"],
            ["damage", "payInvoice"],
        ]);
        expect(detail?.findings?.reviewer?.paragraphs).toEqual(["The page held the IBAN."]);
        expect(detail?.findings?.replay).toMatchObject({ status: "confirmed", costUsd: 0.021 });
        expect(detail?.findings?.replay.rounds).toHaveLength(1);
    });

    it("opens an incident still being found, and one whose finder failed", async () => {
        const ids = Object.fromEntries((await listIncidents()).map((row) => [row.runId, row.id]));

        expect(await getIncident(ids[OPEN])).toMatchObject({ findings: null, findError: null, working: true });
        expect(await getIncident(ids[FAILED])).toMatchObject({
            findings: null,
            findError: "The blocked call's events never arrived",
            working: false,
        });
        expect(await getIncident("inc_ffffffffffffffff")).toBeNull();
    });

    it("reads an incident once per request, since the page and its metadata both ask", () => {
        expect(cached).toEqual([getIncident]);
    });
});
