// @vitest-environment node
import { createProject, ingestBatch } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ago, items, model, runOf, start, stepOf } from "../../../../test/agents/events";
import { NOW } from "../../../../test/time";

vi.mock("@/lib/auth/session", () => ({
    requireSession: async () => ({ sub: "did:privy:1", email: null, github: null, exp: 0 }),
}));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
vi.mock("react", async (original) => {
    const react = await original<typeof import("react")>();
    const cache = <T>(fn: T) => fn;
    // React is CommonJS, so named imports can resolve through its default export
    return { ...react, default: { ...react, cache }, cache };
});

const { getAgentGraph } = await import("./query");
const { database } = await import("../runs/live/client");

const RUN = runOf(1);
const [S1, S2] = [1, 2].map(stepOf) as [string, string];
let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
    vi.stubEnv("DATABASE_URL", test.url);
    vi.spyOn(Date, "now").mockReturnValue(NOW);
}, 60_000);

afterAll(async () => {
    vi.restoreAllMocks();
    await database().destroy();
    vi.unstubAllEnvs();
    await test.stop();
});

// orchestrator's step S1 hands billing work; billing's model call names that step
async function delegation(): Promise<string> {
    const projectId = await createProject(test.db, "Links");
    vi.stubEnv("QUARD_PROJECT_ID", projectId);
    await ingestBatch(
        test.db,
        projectId,
        items([
            start(RUN, "orchestrator", ago(60)),
            model(RUN, "orchestrator", S1, ago(50)),
            model(RUN, "billing", S2, ago(30), { parentStepId: S1 }),
        ]),
    );
    return projectId;
}

// Messages billing's process took in, each naming orchestrator's step S1
async function received(projectId: string, trust: Array<"trusted" | "untrusted">): Promise<void> {
    await test.db
        .insertInto("agent_messages")
        .values(
            trust.map((level, index) => ({
                project_id: projectId,
                event_id: `m${index}`,
                run_id: RUN,
                step_id: S2,
                kind: "message" as const,
                from_agent: "orchestrator",
                to_agent: "billing",
                parent_step_id: S1,
                trust: level,
                sensitivity: "internal" as const,
                at: ago(40 - index),
            })),
        )
        .execute();
}

const link = { from: "orchestrator", to: "billing", delegations: 1, handoffs: 0, messages: 0, total: 1 };

describe("agent links from Postgres", () => {
    it("counts a delegation in one process once", async () => {
        await delegation();

        expect((await getAgentGraph()).edges).toEqual([
            { ...link, untrusted: 0, untrustedShare: 0, lastAt: NOW - 30_000 },
        ]);
    });

    it("counts a delegation two messages name across processes once, as in one process", async () => {
        await received(await delegation(), ["trusted", "trusted"]);

        expect((await getAgentGraph()).edges).toEqual([
            { ...link, untrusted: 0, untrustedShare: 0, lastAt: NOW - 39_000 },
        ]);
    });

    it("counts it as untrusted once when both its messages are untrusted", async () => {
        await received(await delegation(), ["untrusted", "untrusted"]);

        expect((await getAgentGraph()).edges).toEqual([
            { ...link, untrusted: 1, untrustedShare: 1, lastAt: NOW - 39_000 },
        ]);
    });
});
