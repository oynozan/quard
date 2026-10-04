import { readFile } from "node:fs/promises";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decision, item, RUN, started } from "../../test/events.ts";
import { blockedRun, incidentId } from "../../test/incidents.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { ingestBatch } from "../ingest/store.ts";
import { createProject } from "../projects.ts";
import { isDetection } from "./open.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

async function opened(projectId: string) {
    return test.db
        .selectFrom("incidents")
        .select(["id", "run_id as runId", "opened_at as openedAt", "find_state as findState"])
        .where("project_id", "=", projectId)
        .orderBy("run_id")
        .execute();
}

const OTHER_RUN = "4".repeat(32);
const THIRD_RUN = "5".repeat(32);

// What the SDK records for each guard that looks at content
const SOURCE = { guard: "source", rule: "source", decision: "flag", reason: "instructions" } as const;
const DETECTOR = {
    guard: "source",
    rule: "detector:jev",
    decision: "flag",
    reason: "article,prompt_injection",
} as const;
const SIGNATURE = { guard: "signature", rule: "sig-7", decision: "flag", reason: "signature_matched" } as const;
const OBSERVED = { mode: "observe", enforced: false } as const;

describe("opening incidents at ingest", () => {
    it("opens one incident for a blocked run, at its earliest block", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [
            item(started()),
            item(decision("2026-10-03T12:00:05.000Z")),
            item(decision("2026-10-03T12:00:02.000Z")),
        ]);

        const [incident, ...rest] = await opened(projectId);
        expect(rest).toEqual([]);
        expect(incident).toMatchObject({ id: incidentId(projectId), runId: RUN, findState: "pending" });
        expect(incident?.openedAt.toISOString()).toBe("2026-10-03T12:00:02.000Z");
    });

    it("opens one for a block in observe mode, and none for allows", async () => {
        const projectId = await createProject(test.db, "Acme");
        const observed = { ...decision(), runId: OTHER_RUN, mode: "observe" as const, enforced: false };
        const allowed = { ...decision(), decision: "allow" as const };
        await ingestBatch(test.db, projectId, [
            item(started()),
            item(allowed),
            item({ ...started(), runId: OTHER_RUN }),
            item(observed),
        ]);

        expect(await opened(projectId)).toEqual([expect.objectContaining({ runId: OTHER_RUN })]);
    });

    it("opens one for content a guard flagged, at the earliest flag or block", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [
            item(started()),
            item(decision("2026-10-03T12:00:05.000Z")),
            item({ ...decision("2026-10-03T12:00:03.000Z"), ...SOURCE }),
            item({ ...started(), runId: OTHER_RUN }),
            item({ ...decision(), ...DETECTOR, decision: "strip", runId: OTHER_RUN }),
        ]);

        const [first, second, ...rest] = await opened(projectId);
        expect(rest).toEqual([]);
        expect(first?.openedAt.toISOString()).toBe("2026-10-03T12:00:03.000Z");
        expect(second).toMatchObject({ runId: OTHER_RUN, findState: "pending" });
    });

    it("opens one for a flag in observe mode, and none for what found nothing in content", async () => {
        const projectId = await createProject(test.db, "Acme");
        const nothing = [
            { decision: "allow" },
            { ...SOURCE, decision: "pass" },
            { decision: "ask" },
            { guard: "egress", rule: "payload:mask", decision: "strip" },
            { ...DETECTOR, reason: "unchecked" },
        ] as const;
        await ingestBatch(test.db, projectId, [
            item(started()),
            ...nothing.map((fields) => item({ ...decision(), ...fields })),
            item({ ...started(), runId: OTHER_RUN }),
            item({ ...decision(), ...SIGNATURE, ...OBSERVED, runId: OTHER_RUN }),
            item({ ...started(), runId: THIRD_RUN }),
            item({ ...decision(), ...SOURCE, ...OBSERVED, runId: THIRD_RUN }),
        ]);

        expect((await opened(projectId)).map((row) => row.runId)).toEqual([OTHER_RUN, THIRD_RUN]);
    });

    it("keeps the first incident when later blocks arrive", async () => {
        const projectId = await createProject(test.db, "Acme");
        await blockedRun(test.db, projectId, RUN, "2026-10-03T12:00:05.000Z");
        await blockedRun(test.db, projectId, RUN, "2026-10-03T12:00:01.000Z");

        const incidents = await opened(projectId);
        expect(incidents).toHaveLength(1);
        expect(incidents[0]?.openedAt.toISOString()).toBe("2026-10-03T12:00:05.000Z");
    });

    it("gives each run its own incident, per project", async () => {
        const one = await createProject(test.db, "One");
        const two = await createProject(test.db, "Two");
        await blockedRun(test.db, one);
        await blockedRun(test.db, one, OTHER_RUN);
        await blockedRun(test.db, two);

        expect((await opened(one)).map((row) => row.id)).toEqual([incidentId(one), incidentId(one, OTHER_RUN)]);
        expect((await opened(two)).map((row) => row.id)).toEqual([incidentId(two)]);
        expect(incidentId(one)).not.toBe(incidentId(two));
    });

    it("goes when its run goes", async () => {
        const projectId = await createProject(test.db, "Acme");
        await blockedRun(test.db, projectId);

        await test.db.deleteFrom("runs").where("project_id", "=", projectId).execute();
        expect(await opened(projectId)).toEqual([]);
    });
});

describe("isDetection", () => {
    it("counts content the source scan, the detector or a signature flagged or stripped", () => {
        const found = [
            SOURCE,
            { ...SOURCE, decision: "strip" },
            { ...SOURCE, reason: "instructions,unknown_host" },
            DETECTOR,
            { ...DETECTOR, reason: "article,phishing,unchecked" },
            // Flagged on its summed risk, with nothing failed
            { ...DETECTOR, reason: "article" },
            { ...DETECTOR, decision: "strip", reason: "article,unchecked" },
            SIGNATURE,
        ];

        expect(found.map(isDetection)).toEqual(found.map(() => true));
    });

    it("leaves out blocks, passes, asks, egress masking, failed checks, unknown hosts and site rules", () => {
        const none = [
            { ...SOURCE, decision: "block" },
            { ...SOURCE, decision: "pass", reason: null },
            { ...SOURCE, reason: "unknown_host" },
            // A hosted web search site on a blocked domain: Quard never saw its text
            { ...SOURCE, rule: "domain", reason: "content_blocked" },
            { ...DETECTOR, reason: "unchecked" },
            { ...DETECTOR, reason: "article,unchecked" },
            { ...SIGNATURE, decision: "ask" },
            { guard: "egress", rule: "payload:mask", decision: "strip" },
            { guard: "action", rule: "iban:from", decision: "allow" },
        ];

        expect(none.map(isDetection)).toEqual(none.map(() => false));
    });
});

describe("the 0008 migration", () => {
    it("opens incidents for runs blocked before it, with the ids ingest gives", async () => {
        const projectId = await createProject(test.db, "Acme");
        await blockedRun(test.db, projectId, RUN, "2026-10-03T12:00:03.000Z");
        await blockedRun(test.db, projectId, RUN, "2026-10-03T12:00:02.000Z");
        await ingestBatch(test.db, projectId, [
            item({ ...started(), runId: OTHER_RUN }),
            item({ ...decision(), runId: OTHER_RUN, decision: "allow" }),
        ]);
        await test.db.deleteFrom("incidents").where("project_id", "=", projectId).execute();

        const file = await readFile(new URL("../../migrations/0009_incidents.sql", import.meta.url), "utf8");
        const backfill = file.slice(file.indexOf("INSERT INTO incidents"));
        await sql.raw(backfill).execute(test.db);
        await sql.raw(backfill).execute(test.db);

        const [incident, ...rest] = await opened(projectId);
        expect(rest).toEqual([]);
        expect(incident).toMatchObject({ id: incidentId(projectId), runId: RUN, findState: "pending" });
        expect(incident?.openedAt.toISOString()).toBe("2026-10-03T12:00:02.000Z");
    });
});
