// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogRun, type CatalogRun } from "../runs/catalog";
import { allIncidents } from "./list";
import { getIncident, incidentDetail, listIncidents } from "./query";
import { REVIEWS } from "./reviews";
import { INCIDENT_SPECS } from "./specs";

// The catalog is the incidents' data source; tests can swap in a run with edited marks.
vi.mock("../runs/catalog", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../runs/catalog")>();
    return { ...actual, catalogRun: vi.fn(actual.catalogRun) };
});

const realCatalog = await vi.importActual<typeof import("../runs/catalog")>("../runs/catalog");

// The incident's real run, keeping only the marks the filter lets through.
function withMarks(keep: (role: string) => boolean) {
    vi.mocked(catalogRun).mockImplementation((id: string) => {
        const run = realCatalog.catalogRun(id) as CatalogRun;
        return { ...run, built: { ...run.built, marks: run.built.marks.filter((mark) => keep(mark.role)) } };
    });
}

afterEach(() => {
    vi.mocked(catalogRun).mockImplementation(realCatalog.catalogRun);
});

describe("incidentDetail", () => {
    it("gives the verdict, path, replay and reviewer note for an incident across agents", () => {
        const detail = incidentDetail("inc_116")!;
        expect(detail.incident.title).toBe("Hidden instructions in a forwarded email");
        expect(detail.run.id).toBe(detail.incident.runId);
        expect(detail.verdict.category).toBe("bad input");
        expect(detail.verdict.entryPoint.agent).toBe("inbox-triage");
        expect(detail.verdict.entryPoint.title).toBe("claims-desk.io");
        expect(detail.verdict.turningPoint.agent).toBe("support");
        expect(detail.verdict.damage.title).toBe("send_email");
        expect(detail.verdict.missingGuard).toBe(INCIDENT_SPECS.inc_116.missingGuard);
        expect(detail.verdict.handoffFault).toBeNull();
        expect(detail.verdict.acrossAgents).toMatchObject({
            entryAgent: "inbox-triage",
            handoff: { from: "inbox-triage", to: "support" },
            turningAgent: "support",
            damageAgent: "support",
        });
        expect(detail.verdict.versions).toEqual([
            { agent: "inbox-triage", version: "v5" },
            { agent: "support", version: "v31" },
        ]);
        expect(detail.path.map((node) => `${node.role}:${node.kind}`)).toEqual([
            "entry:origin",
            "null:agent",
            "carry:handoff",
            "turning:agent",
            "damage:call",
        ]);
        expect(detail.replay.status).toBe("confirmed");
        expect(detail.reviewer?.paragraphs).toEqual(REVIEWS.inc_116);
    });

    it("leaves out the across-agents part when one agent did everything", () => {
        const detail = incidentDetail("inc_115")!;
        expect(detail.verdict.acrossAgents).toBeNull();
        expect(detail.verdict.versions).toEqual([{ agent: "support", version: "v30" }]);
    });

    it("names the handoff fault the finder recorded", () => {
        expect(incidentDetail("inc_117")!.verdict.handoffFault).toBe("constraint dropped");
    });

    it("agrees with the incident list on agents and replay status for every incident", () => {
        for (const incident of allIncidents()) {
            const detail = incidentDetail(incident.id)!;
            expect(detail.verdict.entryPoint.agent).toBe(incident.entryAgent);
            expect(detail.verdict.damage.agent).toBe(incident.damageAgent);
            expect(detail.replay.status).toBe(incident.replay);
        }
    });

    it("counts the reviewer's cost in the replay cost", () => {
        const detail = incidentDetail("inc_117")!;
        const reruns = detail.replay.rounds.reduce((sum, round) => sum + round.costUsd, 0);
        expect(detail.replay.costUsd).toBeCloseTo(reruns + detail.reviewer!.costUsd, 4);
    });

    it("gives null for an unknown incident", () => {
        expect(incidentDetail("inc_999")).toBeNull();
    });

    it("gives null when the run has no turning point marked", () => {
        withMarks((role) => role !== "turning");
        expect(incidentDetail("inc_116")).toBeNull();
    });

    it("shows no handoff when no handoff carried the content", () => {
        withMarks((role) => role !== "carry");
        const across = incidentDetail("inc_118")!.verdict.acrossAgents;
        expect(across).toEqual({
            entryAgent: "researcher",
            handoff: null,
            turningAgent: "billing",
            damageAgent: "billing",
        });
    });

    it("has no reviewer note before the reviewer writes one", () => {
        const paragraphs = REVIEWS.inc_115;
        delete REVIEWS.inc_115;
        try {
            const detail = incidentDetail("inc_115")!;
            expect(detail.reviewer).toBeNull();
            const reruns = detail.replay.rounds.reduce((sum, round) => sum + round.costUsd, 0);
            expect(detail.replay.costUsd).toBeCloseTo(reruns, 4);
        } finally {
            REVIEWS.inc_115 = paragraphs;
        }
    });
});

describe("listIncidents and getIncident", () => {
    it("list every incident, newest first", async () => {
        expect(await listIncidents()).toEqual(allIncidents());
    });

    it("get one incident's detail, or null", async () => {
        expect((await getIncident("inc_118"))?.incident.id).toBe("inc_118");
        expect(await getIncident("nope")).toBeNull();
    });
});
