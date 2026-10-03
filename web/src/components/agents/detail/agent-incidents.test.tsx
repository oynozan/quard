import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgentDetail } from "@/lib/data/agents";
import { version } from "../../../../test/agents-lib-detail/fixtures";
import { expectNoChartsOrTables } from "../../../../test/empty";
import { NOW } from "../../../../test/time";
import { AgentIncidents } from "./agent-incidents";

type Row = AgentDetail["incidents"][number];

function incident(id: string, roles: Row["roles"], title = `Incident ${id}`): Row {
    return { id, title, roles, openedAt: NOW };
}

describe("AgentIncidents", () => {
    it("lists incidents where the agent was the entry or the turning point", () => {
        const incidents = [
            incident("inc-1", ["entry", "damage"], "Refund sent to an unknown account"),
            incident("inc-2", ["turning"]),
            incident("inc-3", ["damage"]),
        ];
        render(<AgentIncidents incidents={incidents} versions={[]} />);
        const rows = screen.getAllByRole("row").slice(1);
        expect(rows.map((row) => row.textContent)).toEqual([
            "Refund sent to an unknown account—Entry pointDamage3 Oct",
            "Incident inc-2—Turning point3 Oct",
        ]);
        const link = within(rows[0]).getByRole("link");
        expect(link.getAttribute("href")).toBe("/incidents/inc-1");
        expect(within(link).getByTitle("Refund sent to an unknown account")).toBeTruthy();
    });

    it("counts only the named incidents and links to all incidents", () => {
        const incidents = [incident("inc-1", ["entry"]), incident("inc-3", ["damage"])];
        render(<AgentIncidents incidents={incidents} versions={[]} />);
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Incidents1");
        expect(screen.getByRole("link", { name: "View all" }).getAttribute("href")).toBe("/incidents");
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("shows the version tied to each incident", () => {
        const versions = [version("v2", { incidents: ["inc-2"] }), version("v1", { incidents: ["inc-1"] })];
        render(
            <AgentIncidents
                incidents={[incident("inc-1", ["entry"]), incident("inc-2", ["turning"])]}
                versions={versions}
            />,
        );
        const cells = screen
            .getAllByRole("row")
            .slice(1)
            .map((row) => row.children[1].textContent);
        expect(cells).toEqual(["v1", "v2"]);
    });

    it("says the agent only took damage when no incident names it otherwise, with no table", () => {
        const { rerender } = render(<AgentIncidents incidents={[incident("inc-3", ["damage"])]} versions={[]} />);
        expect(screen.getByRole("status").textContent).toBe("Damage only, in 1 incident");
        const two = [incident("inc-3", ["damage"]), incident("inc-4", ["damage"])];
        rerender(<AgentIncidents incidents={two} versions={[]} />);
        expect(screen.getByRole("status").textContent).toBe("Damage only, in 2 incidents");
        expectNoChartsOrTables();
    });

    it("says there are no incidents yet, with no table, count or link", () => {
        render(<AgentIncidents incidents={[]} versions={[]} />);
        expect(screen.getByRole("status").textContent).toBe("No incidents yet");
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Incidents");
        expect(screen.queryByRole("link")).toBeNull();
        expectNoChartsOrTables();
    });

    it("dates each incident by when it opened", () => {
        render(
            <AgentIncidents
                incidents={[{ ...incident("inc-1", ["entry"]), openedAt: Date.UTC(2026, 7, 14) }]}
                versions={[]}
            />,
        );
        expect(screen.getAllByRole("row")[1].lastElementChild?.textContent).toBe("14 Aug");
    });
});
