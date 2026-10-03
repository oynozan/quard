import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../test/auth-app/browser";
import { getOverview } from "@/lib/data/overview";
import { catalogRows } from "@/lib/data/runs/catalog";
import type { RunQuery } from "@/lib/data/runs/types";
import { DAY, NOW } from "@/lib/data/rng";
import OverviewPage from "./page";

const query = vi.hoisted(() => ({ listRuns: vi.fn() }));
vi.mock("@/lib/data/runs/query", () => ({
    listRuns: (filter: RunQuery) => {
        query.listRuns(filter);
        return Promise.resolve(catalogRows().slice(0, filter.limit));
    },
    // Two days after the sample data, so ages from this clock differ from the sample clock
    requestTime: async () => NOW + 2 * DAY,
}));

describe("OverviewPage", () => {
    beforeEach(() => {
        stubBrowser();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("greets the viewer and shows the six newest runs from the database, aged by the request time", async () => {
        const data = await getOverview();
        render(await OverviewPage());
        expect(screen.getByText(data.greeting)).toBeTruthy();
        expect(query.listRuns).toHaveBeenCalledWith({ limit: 6 });
        const recent = screen.getByRole("region", { name: "Recent runs" });
        const links = within(recent)
            .getAllByRole("link")
            .map((link) => link.getAttribute("href"))
            .filter((href) => href !== "/runs");
        expect(links).toEqual(
            catalogRows()
                .slice(0, 6)
                .map((run) => `/runs/${run.id}`),
        );
        const rows = within(recent).getAllByRole("row").slice(1);
        expect(rows.map((row) => row.textContent!.endsWith("2 d ago"))).toEqual(Array(6).fill(true));
    });

    it("counts approvals and incidents from the sample data, with the decision log under them", async () => {
        const data = await getOverview();
        render(await OverviewPage());
        const approvals = within(screen.getByRole("region", { name: "Approvals waiting" }));
        expect(approvals.getByRole("heading", { level: 2 }).textContent).toBe(
            `Approvals waiting${data.approvals.length}`,
        );
        const incidents = within(screen.getByRole("region", { name: "Incidents" }));
        expect(incidents.getByRole("heading", { level: 2 }).textContent).toBe(`Incidents${data.incidents.length}`);
        expect(screen.getByText("Decision log")).toBeTruthy();
    });
});
