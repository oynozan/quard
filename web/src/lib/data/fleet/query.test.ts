// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentEdges, incidentRoles } from "../agents/graph";
import { NOW } from "../rng";
import { catalogRuns } from "../runs/catalog";
import { quarantined, watched } from "./quarantine";
import { getFleet } from "./query";
import { blockSeries } from "./series";

const data = vi.hoisted(() => ({ noIncidents: false }));

vi.mock("../incidents/query", async (importOriginal) => {
    const real = await importOriginal<typeof import("../incidents/query")>();
    return { ...real, incidentDetail: (id: string) => (data.noIncidents ? null : real.incidentDetail(id)) };
});

afterEach(() => {
    data.noIncidents = false;
});

const byCountThenName = <T>(rows: T[], count: (row: T) => number, name: (row: T) => string) =>
    [...rows].sort((a, b) => count(b) - count(a) || name(a).localeCompare(name(b)));

describe("getFleet", () => {
    it("covers the 30 days of the block series, up to now", async () => {
        const fleet = await getFleet();
        const { byGuard, heatmap } = blockSeries();

        expect(fleet).toMatchObject({ windowDays: 30, startAt: byGuard.startAt, endAt: NOW });
        expect(fleet.blocksByGuard).toBe(byGuard);
        expect(fleet.blocksHeatmap).toBe(heatmap);
    });

    it("counts incidents by the source that started them, most first", async () => {
        const sources = (await getFleet()).incidentsBySource;

        expect(sources[0]).toEqual({
            origin: "email:claims-desk.io",
            label: { origin: "email:claims-desk.io", trust: "untrusted", sensitivity: "public" },
            count: 2,
        });
        expect(sources).toEqual(
            byCountThenName(
                sources,
                (row) => row.count,
                (row) => row.origin,
            ),
        );
        expect(sources.reduce((sum, row) => sum + row.count, 0)).toBe(incidentRoles().length);
    });

    it("counts incidents by the tool that did the damage, ties in name order", async () => {
        const tools = (await getFleet()).incidentsByTool;

        expect(tools.slice(0, 3)).toEqual([
            { tool: "pay_invoice", count: 5 },
            { tool: "send_email", count: 4 },
            { tool: "create_ticket", count: 1 },
        ]);
        expect(tools).toEqual(
            byCountThenName(
                tools,
                (row) => row.count,
                (row) => row.tool,
            ),
        );
    });

    it("puts the agents named most often at the entry or turning point first", async () => {
        const points = (await getFleet()).agentPoints;
        const roles = incidentRoles();

        expect(points).toHaveLength(6);
        expect(points[0]).toEqual({
            agent: "billing",
            entry: roles.filter((role) => role.entry === "billing").length,
            turning: roles.filter((role) => role.turning === "billing").length,
            damage: roles.filter((role) => role.damage === "billing").length,
        });
        const totals = points.map((row) => row.entry + row.turning);
        expect(totals).toEqual([...totals].sort((a, b) => b - a));
    });

    it("lists up to six links that carried untrusted content, most first", async () => {
        const links = (await getFleet()).untrustedLinks;
        const carried = agentEdges().filter((edge) => edge.untrusted > 0);
        const top = [...carried].sort((a, b) => b.untrusted - a.untrusted).slice(0, 6);

        expect(carried.length).toBeGreaterThan(6);
        expect(links).toEqual(
            top.map(({ from, to, total, untrusted, untrustedShare }) => ({
                from,
                to,
                total,
                untrusted,
                untrustedShare,
            })),
        );
    });

    it("counts observe-mode limits as would-stop and block-mode limits as stopped", async () => {
        const limits = (await getFleet()).runLimits;

        expect(limits.map((limit) => [limit.name, limit.mode, limit.wouldStop, limit.stopped])).toEqual([
            ["depth", "observe", 7, 0],
            ["fan-out", "observe", 2, 0],
            ["loops", "block", 0, 4],
            ["steps", "observe", 11, 0],
            ["cost", "observe", 5, 0],
        ]);
        expect(limits[0]).toMatchObject({ limit: 3, unit: "levels" });
    });

    it("adds quarantine blocks from listed runs to older attempts", async () => {
        const [iban, domain, email] = (await getFleet()).quarantine;
        const [olderIban, olderDomain, olderEmail] = quarantined();
        const hits = catalogRuns()
            .flatMap((run) => run.detail.steps)
            .filter((step) => step.guard?.rule === "fleet-check" && step.guard.reason.startsWith("LT12…1000 is on"))
            .map((step) => step.startedAt);

        expect(hits.length).toBeGreaterThan(0);
        expect(iban).toEqual({
            ...olderIban,
            blockedAttempts: olderIban.blockedAttempts + hits.length,
            lastAttemptAt: Math.max(olderIban.lastAttemptAt, ...hits),
        });
        expect(iban.lastAttemptAt).toBeGreaterThan(olderIban.lastAttemptAt);
        expect(domain).toEqual(olderDomain);
        expect(email).toEqual(olderEmail);
    });

    it("shows watched values and the fleet check's settings", async () => {
        const fleet = await getFleet();

        expect(fleet.watching).toEqual(watched());
        expect(fleet.fleetCheck).toEqual({
            fields: ["iban", "to", "url"],
            newForDays: 7,
            runsToBlock: 5,
            withinHours: 24,
            observeUntil: null,
        });
    });

    it("counts nothing by source or tool when no incident has a verdict", async () => {
        data.noIncidents = true;

        const fleet = await getFleet();

        expect(fleet.incidentsBySource).toEqual([]);
        expect(fleet.incidentsByTool).toEqual([]);
        expect(fleet.agentPoints.every((row) => row.entry + row.turning + row.damage === 0)).toBe(true);
    });
});
