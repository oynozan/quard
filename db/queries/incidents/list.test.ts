import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { blockedRun, verdict } from "../../test/incidents.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { getIncident, incidentsForAgent, incidentsForRuns, listIncidents } from "./list.ts";
import { saveVerdict } from "./save.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const RUNS = ["4".repeat(32), "5".repeat(32), "6".repeat(32)];

// Three incidents opened a minute apart, the first with its verdict found
async function threeIncidents(): Promise<{ projectId: string; ids: string[] }> {
    const projectId = await createProject(test.db, "Acme");
    const ids = [];
    for (const [index, runId] of RUNS.entries()) {
        ids.push(await blockedRun(test.db, projectId, runId, `2026-10-03T12:0${index}:00.000Z`));
    }
    await saveVerdict(test.db, projectId, ids[0] as string, verdict());
    return { projectId, ids };
}

describe("listIncidents", () => {
    it("lists a project's incidents newest first, up to the limit", async () => {
        const { projectId, ids } = await threeIncidents();
        await threeIncidents();

        const incidents = await listIncidents(test.db, projectId, { limit: 2 });

        expect(incidents.map((incident) => incident.id)).toEqual([ids[2], ids[1]]);
        expect(incidents[0]).toEqual({
            id: ids[2],
            runId: RUNS[2],
            openedAt: new Date("2026-10-03T12:02:00.000Z"),
            seenAt: null,
            findState: "pending",
            findError: null,
            replayState: "idle",
            verdict: null,
            replay: null,
            spentUsd: 0,
            capUsd: 5,
            category: null,
            damageTool: null,
            damageAgent: null,
            entryAgent: null,
            entryOrigin: null,
            entryTrust: null,
            turningAgent: null,
        });
    });
});

describe("getIncident", () => {
    it("reads one incident of the project", async () => {
        const { projectId, ids } = await threeIncidents();

        expect(await getIncident(test.db, projectId, ids[0] as string)).toMatchObject({
            runId: RUNS[0],
            findState: "done",
            verdict: verdict(),
        });
        const other = await createProject(test.db, "Other");
        expect(await getIncident(test.db, other, ids[0] as string)).toBeUndefined();
    });
});

describe("incidentsForAgent", () => {
    it("finds the incidents an agent took part in, in any role", async () => {
        const { projectId, ids } = await threeIncidents();
        const handoff = verdict({ damage: { ...verdict().damage, agent: "payments" } });
        await saveVerdict(test.db, projectId, ids[1] as string, handoff);

        const found = async (agent: string) =>
            (await incidentsForAgent(test.db, projectId, agent)).map((incident) => incident.id);
        expect(await found("researcher")).toEqual([ids[1], ids[0]]);
        expect(await found("planner")).toEqual([ids[1], ids[0]]);
        expect(await found("billing")).toEqual([ids[0]]);
        expect(await found("payments")).toEqual([ids[1]]);
        expect(await found("nobody")).toEqual([]);
    });
});

describe("incidentsForRuns", () => {
    it("maps runs to their incidents", async () => {
        const { projectId, ids } = await threeIncidents();

        const found = await incidentsForRuns(test.db, projectId, [RUNS[0] as string, "7".repeat(32)]);

        expect(found).toEqual([{ runId: RUNS[0], id: ids[0] }]);
        expect(await incidentsForRuns(test.db, projectId, [])).toEqual([]);
    });
});
