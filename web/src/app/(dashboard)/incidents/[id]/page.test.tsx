import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IncidentDetail } from "@/lib/data/incidents/types";
import { formatLongDate } from "@/lib/format";
import { shadersModule } from "../../../../../test/auth-app/shell";
import { INCIDENT_DETAIL } from "../../../../../test/incidents/detail";
import { replayOf } from "../../../../../test/incidents-search/replay";
import { NOW } from "../../../../../test/time";
import IncidentPage, { generateMetadata } from "./page";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
const data = vi.hoisted(() => ({ getIncident: vi.fn<(id: string) => Promise<IncidentDetail | null>>() }));
vi.mock("@/lib/data/incidents/query", () => data);
const actions = vi.hoisted(() => ({ replayIncident: vi.fn(), markIncidentSeen: vi.fn(async () => {}) }));
vi.mock("@/lib/data/incidents/actions", () => actions);
vi.mock("@/lib/data/scope", () => ({ requestTime: async () => NOW }));
vi.mock("@paper-design/shaders", () => shadersModule);
vi.mock("next/navigation", () => ({
    notFound: () => {
        throw new Error("not found");
    },
    useRouter: () => router,
}));

const props = (id: string) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });

const { incident } = INCIDENT_DETAIL;
const findings = INCIDENT_DETAIL.findings!;
// The stored incident, with its replay finished
const DONE: IncidentDetail = { ...INCIDENT_DETAIL, incident: { ...incident, replay: "confirmed" } };

async function show(detail: IncidentDetail) {
    data.getIncident.mockResolvedValue(detail);
    render(await IncidentPage(props(incident.id)));
}

beforeEach(() => {
    data.getIncident.mockResolvedValue(null);
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches: true })),
    );
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(null, { status: 204 })),
    );
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    router.refresh.mockClear();
    actions.markIncidentSeen.mockClear();
});

describe("IncidentPage", () => {
    it("shows the not-found page for an id the project does not have", async () => {
        await expect(IncidentPage(props("inc_0000000000000000"))).rejects.toThrow("not found");
        expect(data.getIncident).toHaveBeenCalledWith("inc_0000000000000000");
    });

    it("says the incident is missing in the tab title", async () => {
        expect(await generateMetadata(props(incident.id))).toEqual({ title: "Incident not found" });
    });

    it("shows a stored incident with links back to the list and on to its run", async () => {
        await show(DONE);
        expect(screen.getByRole("heading", { level: 1, name: incident.title })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Incidents" }).getAttribute("href")).toBe("/incidents");
        expect(screen.getByRole("link", { name: "Open run" }).getAttribute("href")).toBe(`/runs/${incident.runId}`);
        const opened = screen.getByTitle(formatLongDate(incident.openedAt));
        expect(opened.textContent).toBe("Opened 3 min ago");
        expect(opened.parentElement?.textContent).toContain("Run Blocked");
    });

    it("keeps the replay button, locked once the replay has an answer", async () => {
        await show(DONE);
        const button = screen.getByRole("button", { name: "Replay" }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        expect(button.title).toBe("The replay already has an answer");
    });

    it("shows the path, the replay and the verdict", async () => {
        await show(DONE);
        expect(screen.getByText("4 steps")).toBeTruthy();
        const replay = within(screen.getByRole("region", { name: "Replay" }));
        expect(replay.getByText("Confirmed")).toBeTruthy();
        expect(within(screen.getByRole("region", { name: "Verdict" })).getByText("bad input")).toBeTruthy();
    });

    it("keeps the replay pane before the first round", async () => {
        await show({
            ...INCIDENT_DETAIL,
            incident: { ...incident, replay: "not started" },
            findings: { ...findings, replay: replayOf([]) },
        });
        const replay = within(screen.getByRole("region", { name: "Replay results" }));
        expect(replay.getByText("0 × 5 + 5")).toBeTruthy();
        expect(replay.getByRole("img").getAttribute("aria-label")).toBe("No replay rounds yet.");
        expect(replay.getByText("No rounds yet")).toBeTruthy();
        expect((screen.getByRole("button", { name: "Replay" }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("marks an incident nobody opened yet as seen once its page is open", async () => {
        await show({ ...DONE, incident: { ...DONE.incident, seen: false } });
        expect(actions.markIncidentSeen).toHaveBeenCalledTimes(1);
        expect(actions.markIncidentSeen).toHaveBeenCalledWith(incident.id);
    });

    it("leaves an incident someone already opened as it is", async () => {
        await show(DONE);
        expect(actions.markIncidentSeen).not.toHaveBeenCalled();
    });

    it("says the finder is still at work, and offers no replay yet", async () => {
        await show({ ...INCIDENT_DETAIL, incident: { ...incident, replay: "not started" }, findings: null });
        const status = screen.getByRole("status");
        expect(status.textContent).toBe("Finding the entry point, the turning point and the damage…");
        expect(status.querySelector(".spinner")).toBeTruthy();
        expect(screen.queryByRole("region", { name: "Verdict" })).toBeNull();
        const button = screen.getByRole("button", { name: "Replay" }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        expect(button.title).toBe("Replay starts once the verdict is found");
    });

    it("says the worker isn't running in place of the finder's spinner, and reloads until it is", async () => {
        vi.useFakeTimers();
        await show({
            ...INCIDENT_DETAIL,
            incident: { ...incident, replay: "not started" },
            findings: null,
            working: true,
            workerRunning: false,
        });
        const status = screen.getByRole("status");
        expect(status.textContent).toBe("Waiting for the worker. It isn't running.");
        expect(status.querySelector(".spinner")).toBeNull();
        expect(status.querySelector(".bg-warning")).toBeTruthy();
        await act(async () => vi.advanceTimersByTime(5000));
        expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it("says queued while a worker is about to claim the replay", async () => {
        await show({
            ...INCIDENT_DETAIL,
            incident: { ...incident, replay: "queued" },
            findings: { ...findings, replay: replayOf([], [], { status: "queued" }) },
            working: true,
        });
        const replay = within(screen.getByRole("region", { name: "Replay results" }));
        expect(replay.getByText("Queued")).toBeTruthy();
        expect((screen.getByRole("button", { name: "Queued" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("shows the round in progress while a worker replays", async () => {
        await show({
            ...INCIDENT_DETAIL,
            incident: { ...incident, replay: "running" },
            findings: { ...findings, replay: replayOf([[5, 0, 0.004]], [], { status: "running" }) },
            working: true,
        });
        const replay = within(screen.getByRole("region", { name: "Replay results" }));
        expect(replay.getByText("Replaying round 2…")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Replaying…" }).getAttribute("aria-busy")).toBe("true");
    });

    it.each(["queued", "running"] as const)(
        "says the worker isn't running in the replay pane while the replay is %s, and reloads until it is",
        async (status) => {
            vi.useFakeTimers();
            await show({
                ...INCIDENT_DETAIL,
                incident: { ...incident, replay: status },
                findings: { ...findings, replay: replayOf([[5, 0, 0.004]], [], { status }) },
                working: true,
                workerRunning: false,
            });
            const replay = within(screen.getByRole("region", { name: "Replay results" }));
            expect(replay.getByText("Waiting for the worker. It isn't running.")).toBeTruthy();
            expect(replay.queryByText(/^Replaying round/)).toBeNull();
            expect(replay.queryByText("Queued")).toBeNull();
            await act(async () => vi.advanceTimersByTime(5000));
            expect(router.refresh).toHaveBeenCalledTimes(1);
        },
    );

    it("says why the finder stopped", async () => {
        await show({
            ...INCIDENT_DETAIL,
            incident: { ...incident, replay: "not started" },
            findError: "The blocked call's events never arrived",
            findings: null,
        });
        expect(screen.getByRole("alert").textContent).toBe(
            "The root-cause finder stopped: The blocked call's events never arrived" +
                "The run's own page still shows every step.",
        );
        const button = screen.getByRole("button", { name: "Replay" }) as HTMLButtonElement;
        expect(button.title).toBe("Replay can't run: the root cause was not found");
    });

    it("reloads every 5 seconds while the worker is at work", async () => {
        vi.useFakeTimers();
        await show({ ...INCIDENT_DETAIL, working: true });
        await act(async () => vi.advanceTimersByTime(5000));
        expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it("does not reload once the work is done", async () => {
        vi.useFakeTimers();
        await show(DONE);
        await act(async () => vi.advanceTimersByTime(5000));
        expect(router.refresh).not.toHaveBeenCalled();
    });

    it("titles the tab with a stored incident", async () => {
        data.getIncident.mockResolvedValue(INCIDENT_DETAIL);
        expect(await generateMetadata(props(incident.id))).toEqual({ title: incident.title });
    });
});
