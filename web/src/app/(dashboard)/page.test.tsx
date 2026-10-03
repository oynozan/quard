import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OverviewData } from "@/lib/data/overview";
import type { RunRow } from "@/lib/data/runs/types";
import type { ApprovalRequest } from "@/lib/data/types";
import { openRequests } from "../../../test/approvals-overview/fixtures";
import { expectNoChartsOrTables } from "../../../test/empty";
import { stubResizeObserver } from "../../../test/overview/browser";
import { overview, QUIET, runRow } from "../../../test/overview/fixtures";
import { DAY, NOW } from "../../../test/time";
import OverviewPage from "./page";

const data = vi.hoisted(() => ({
    getOverview: vi.fn<(now: number) => Promise<OverviewData | null>>(),
    listRuns: vi.fn<(filter: { limit: number }) => Promise<RunRow[]>>(),
    openApprovalRequests: vi.fn<() => Promise<ApprovalRequest[]>>(),
    openApprovalCount: vi.fn<() => Promise<number>>(),
}));
vi.mock("@/lib/data/overview", () => ({ getOverview: data.getOverview }));
vi.mock("@/lib/data/runs/query", () => ({ listRuns: data.listRuns }));
vi.mock("@/lib/data/scope", () => ({ requestTime: async () => NOW }));
vi.mock("@/lib/data/approvals", () => ({
    openApprovalRequests: data.openApprovalRequests,
    openApprovalCount: data.openApprovalCount,
}));

// Six runs that started two days before the request
const RUNS = Array.from({ length: 6 }, (_, n) => runRow({ id: `${n}`.repeat(32), startedAt: NOW - 2 * DAY }));

beforeEach(() => {
    stubResizeObserver();
    data.getOverview.mockResolvedValue(overview());
    data.listRuns.mockResolvedValue(RUNS);
    data.openApprovalRequests.mockResolvedValue([]);
    data.openApprovalCount.mockResolvedValue(0);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

const region = (name: string) => within(screen.getByRole("region", { name }));

describe("OverviewPage", () => {
    it("shows only the greeting and one line before the first run", async () => {
        data.getOverview.mockResolvedValue(null);
        data.listRuns.mockResolvedValue([]);
        const { container } = render(await OverviewPage());

        expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["Good evening."]);
        expect(screen.getByRole("status").textContent).toBe("No activity yet");
        expect(container.textContent).toBe("Good evening.No activity yet");
        expectNoChartsOrTables(container);
    });

    it("reads the overview at the request time and greets with it", async () => {
        render(await OverviewPage());

        expect(data.getOverview).toHaveBeenCalledWith(NOW);
        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Good evening. 2 agents are running.");
        expect(screen.getByRole("img", { name: /^Model calls per 10 min/ })).toBeTruthy();
        for (const name of ["Runs", "Guarded tools", "Block rate", "Guard decisions"]) {
            expect(screen.getByRole("region", { name })).toBeTruthy();
        }
        expect(screen.getByRole("complementary", { name: "Fleet summary" })).toBeTruthy();
    });

    it("shows the six newest runs from the database, aged by the request time", async () => {
        render(await OverviewPage());

        expect(data.listRuns).toHaveBeenCalledWith({ limit: 6 });
        const recent = region("Recent runs");
        const links = recent
            .getAllByRole("link")
            .map((link) => link.getAttribute("href"))
            .filter((href) => href !== "/runs");
        expect(links).toEqual(RUNS.map((run) => `/runs/${run.id}`));
        const rows = recent.getAllByRole("row").slice(1);
        expect(rows.map((row) => row.textContent!.endsWith("2 d ago"))).toEqual(Array(6).fill(true));
    });

    it("lists the open approval requests from the database", async () => {
        data.openApprovalRequests.mockResolvedValue(openRequests().map((item) => item.request));
        data.openApprovalCount.mockResolvedValue(4);
        render(await OverviewPage());

        expect(region("Approvals waiting").getByRole("heading", { level: 2 }).textContent).toBe("Approvals waiting4");
        expect(region("Approvals waiting").getAllByRole("row")).toHaveLength(5);
    });

    it("shows approvals and incidents as empty with nothing open, with the decision log under them", async () => {
        render(await OverviewPage());

        expect(region("Approvals waiting").getByRole("status").textContent).toBe("No approvals waiting");
        expect(region("Approvals waiting").getAllByRole("columnheader")).toHaveLength(4);
        expect(region("Incidents").getByRole("status").textContent).toBe("No incidents yet");
        expect(region("Decision log").getAllByRole("listitem")).toHaveLength(2);
        expectNoChartsOrTables(screen.getByRole("region", { name: "Incidents" }));
    });

    it("gives every part its own line when the project's runs are older than every window", async () => {
        data.getOverview.mockResolvedValue(QUIET);
        data.listRuns.mockResolvedValue([]);
        const { container } = render(await OverviewPage());

        expect(screen.getAllByRole("status").map((line) => line.textContent)).toEqual([
            "No model calls in the last 24 hours",
            "No runs in the last 24 hours",
            "No tool calls in the last 24 hours",
            "No guarded tool calls in the last 30 days",
            "No blocks or asks in the last 24 hours",
            "No approvals waiting",
            "No runs yet",
            "No incidents yet",
            "No guard decisions in the last 24 hours",
            "No agents in the last 30 days",
            "No guard decisions in the last 24 hours",
        ]);
        expect(screen.queryByText("Live")).toBeNull();
        // The approvals pane keeps its table header over its empty row
        screen.getByRole("region", { name: "Approvals waiting" }).remove();
        expectNoChartsOrTables(container);
    });
});
