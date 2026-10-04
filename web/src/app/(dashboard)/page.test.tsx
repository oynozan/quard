import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OverviewData } from "@/lib/data/overview";
import type { RunRow } from "@/lib/data/runs/types";
import type { SdkReports } from "@/lib/data/sdk-reports";
import type { ApprovalRequest, Incident } from "@/lib/data/types";
import { openRequests } from "../../../test/approvals-overview/fixtures";
import { stubResizeObserver } from "../../../test/overview/browser";
import { INCIDENTS, NEW_INSTALL, overview, runRow } from "../../../test/overview/fixtures";
import { DAY, NOW } from "../../../test/time";
import OverviewPage from "./page";

const data = vi.hoisted(() => ({
    getOverview: vi.fn<(now: number) => Promise<OverviewData>>(),
    listRuns: vi.fn<(filter: { limit: number }) => Promise<RunRow[]>>(),
    listIncidents: vi.fn<(limit: number) => Promise<Incident[]>>(),
    openApprovalRequests: vi.fn<() => Promise<ApprovalRequest[]>>(),
    openApprovalCount: vi.fn<() => Promise<number>>(),
    getSdkReports: vi.fn<(now: number) => Promise<SdkReports>>(),
}));
vi.mock("@/lib/data/sdk-reports", () => ({ getSdkReports: data.getSdkReports }));
vi.mock("@/lib/data/overview", () => ({ getOverview: data.getOverview }));
vi.mock("@/lib/data/runs/query", () => ({ listRuns: data.listRuns }));
vi.mock("@/lib/data/incidents/query", () => ({ listIncidents: data.listIncidents }));
vi.mock("@/lib/data/scope", () => ({ requestTime: async () => NOW }));
vi.mock("@/lib/data/approvals", () => ({
    openApprovalRequests: data.openApprovalRequests,
    openApprovalCount: data.openApprovalCount,
}));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// Six runs that started two days before the request
const RUNS = Array.from({ length: 6 }, (_, n) => runRow({ id: `${n}`.repeat(32), startedAt: NOW - 2 * DAY }));

beforeEach(() => {
    stubResizeObserver();
    data.getOverview.mockResolvedValue(overview());
    data.listRuns.mockResolvedValue(RUNS);
    data.listIncidents.mockResolvedValue([]);
    data.openApprovalRequests.mockResolvedValue([]);
    data.openApprovalCount.mockResolvedValue(0);
    data.getSdkReports.mockResolvedValue({ configErrors: [], dropped: null });
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

const region = (name: string) => within(screen.getByRole("region", { name }));
const headers = (name: string) =>
    region(name)
        .getAllByRole("columnheader")
        .map((header) => header.textContent);

describe("OverviewPage", () => {
    it("reads the overview at the request time and greets with it", async () => {
        render(await OverviewPage());

        expect(data.getOverview).toHaveBeenCalledWith(NOW);
        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Good evening. 2 agents are running.");
        expect(screen.getByRole("img", { name: /^Model calls per 10 min/ })).toBeTruthy();
        for (const name of ["Runs", "Guarded tools", "Block rate", "Guard decisions"]) {
            expect(screen.getByRole("region", { name })).toBeTruthy();
        }
        expect(screen.getByRole("complementary", { name: "Fleet summary" })).toBeTruthy();
        // Nothing went wrong in the SDKs, so there is no problems panel
        expect(data.getSdkReports).toHaveBeenCalledWith(NOW);
        expect(screen.queryByRole("region", { name: "SDK problems" })).toBeNull();
    });

    it("shows what SDKs reported under the terminal cards, before the tables", async () => {
        data.getSdkReports.mockResolvedValue({ configErrors: [], dropped: { count: 12, lastAt: NOW - 60_000 } });
        render(await OverviewPage());

        const problems = screen.getByRole("region", { name: "SDK problems" });
        expect(problems.textContent).toContain("12 events were lost in the last 24 hours");
        expect(problems.previousElementSibling?.contains(screen.getByRole("region", { name: "Runs" }))).toBe(true);
        expect(problems.nextElementSibling?.contains(screen.getByRole("region", { name: "Recent runs" }))).toBe(true);
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

    it("shows the six newest incidents from the database", async () => {
        data.listIncidents.mockResolvedValue(INCIDENTS);
        render(await OverviewPage());

        expect(data.listIncidents).toHaveBeenCalledWith(6);
        const links = region("Incidents")
            .getAllByRole("link")
            .map((link) => link.getAttribute("href"))
            .filter((href) => href !== "/incidents");
        expect(links).toEqual(INCIDENTS.map((incident) => `/incidents/${incident.id}`));
    });

    it("keeps the approvals and incidents tables, empty, with nothing open, and the decision log under them", async () => {
        render(await OverviewPage());

        expect(headers("Approvals waiting")).toEqual(["Call", "Influenced by", "Waiting", "Actions"]);
        expect(region("Approvals waiting").getByRole("status").textContent).toBe("No approvals waiting");
        expect(headers("Incidents")).toEqual(["Incident", "Cause", "Replay", "Opened"]);
        expect(region("Incidents").getByRole("status").textContent).toBe("No incidents yet");
        expect(region("Decision log").getAllByRole("listitem")).toHaveLength(2);
    });

    it("reads its data again every 5 seconds, so its Live marks hold", async () => {
        vi.useFakeTimers();
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 204 })),
        );
        render(await OverviewPage());

        await act(async () => vi.advanceTimersByTime(4999));
        expect(router.refresh).not.toHaveBeenCalled();
        await act(async () => vi.advanceTimersByTime(1));
        expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it("keeps the whole layout on a new install, with empty frames, zeros and table headers", async () => {
        data.getOverview.mockResolvedValue(NEW_INSTALL);
        data.listRuns.mockResolvedValue([]);
        render(await OverviewPage());

        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Good evening.");
        const hero = region("Model calls in the last 24 hours");
        expect(hero.getByRole("img", { name: "No model calls in the last 24 hours" })).toBeTruthy();
        expect(hero.getByText("Model calls per 10 min").parentElement?.textContent).toBe(
            "Model calls per 10 min—in 24h",
        );

        expect(region("Runs").getByText("Per hour").parentElement?.textContent).toBe("Per hour0 now");
        expect(region("Guarded tools").getByText("0 / 0")).toBeTruthy();
        expect(
            region("Block rate").getByRole("img", { name: "No guarded tool calls in the last 30 days" }),
        ).toBeTruthy();
        expect(region("Guard decisions").getByText("Blocked").parentElement?.textContent).toBe("Blocked00");

        expect(headers("Recent runs")).toEqual(["Run", "Status", "Guard decisions", "Cost", "Spend", "Started"]);
        expect(screen.getAllByRole("status").map((line) => line.textContent)).toEqual([
            "No approvals waiting",
            "No runs yet",
            "No incidents yet",
        ]);
        expect(region("Decision log").getByText("No guard decisions in the last 24 hours")).toBeTruthy();

        const rail = within(screen.getByRole("complementary", { name: "Fleet summary" }));
        expect(rail.getByRole("progressbar", { name: "0 of 0 agents running" })).toBeTruthy();
        expect(rail.getByText("signature").nextElementSibling?.textContent).toBe("0");
    });
});
