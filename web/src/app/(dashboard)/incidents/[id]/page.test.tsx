import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getIncident } from "@/lib/data/incidents/query";
import { formatLongDate } from "@/lib/format";
import { INCIDENT_DETAIL } from "../../../../../test/incidents/detail";
import { replayOf } from "../../../../../test/incidents-search/replay";
import { NOW } from "../../../../../test/time";
import IncidentPage, { generateMetadata } from "./page";

vi.mock("next/navigation", () => ({
    notFound: () => {
        throw new Error("not found");
    },
}));
vi.mock("@/lib/data/scope", () => ({ requestTime: async () => NOW }));
vi.mock("@/lib/data/incidents/query", async (importOriginal) => {
    const real = await importOriginal<typeof import("@/lib/data/incidents/query")>();
    return { ...real, getIncident: vi.fn(real.getIncident) };
});

const props = (id: string) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });

const { incident } = INCIDENT_DETAIL;

describe("IncidentPage", () => {
    it("shows the not-found page for any id while nothing stores incidents", async () => {
        await expect(IncidentPage(props(incident.id))).rejects.toThrow("not found");
        expect(getIncident).toHaveBeenCalledWith(incident.id);
    });

    it("says the incident is missing in the tab title", async () => {
        expect(await generateMetadata(props(incident.id))).toEqual({ title: "Incident not found" });
    });

    it("shows a stored incident with links back to the list and on to its run", async () => {
        vi.mocked(getIncident).mockResolvedValueOnce(INCIDENT_DETAIL);
        render(await IncidentPage(props(incident.id)));
        expect(screen.getByRole("heading", { level: 1, name: incident.title })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Incidents" }).getAttribute("href")).toBe("/incidents");
        expect(screen.getByRole("link", { name: "Open run" }).getAttribute("href")).toBe(`/runs/${incident.runId}`);
        expect(screen.queryByRole("button", { name: "Replay round" })).toBeNull();
        const opened = screen.getByTitle(formatLongDate(incident.openedAt));
        expect(opened.textContent).toBe("Opened 3 min ago");
        expect(opened.parentElement?.textContent).toContain("Run Blocked");
    });

    it("shows the path, the replay, the AI explanation and the verdict", async () => {
        vi.mocked(getIncident).mockResolvedValueOnce(INCIDENT_DETAIL);
        render(await IncidentPage(props(incident.id)));
        expect(screen.getByText("4 steps")).toBeTruthy();
        const replay = within(screen.getByRole("region", { name: "Replay" }));
        expect(replay.getByText("Confirmed")).toBeTruthy();
        expect(screen.getByText(INCIDENT_DETAIL.reviewer!.paragraphs[0])).toBeTruthy();
        expect(within(screen.getByRole("region", { name: "Verdict" })).getByText("bad input")).toBeTruthy();
    });

    it("keeps the replay and AI reviewer panes before the first round and note", async () => {
        vi.mocked(getIncident).mockResolvedValueOnce({ ...INCIDENT_DETAIL, replay: replayOf([]), reviewer: null });
        render(await IncidentPage(props(incident.id)));
        const replay = within(screen.getByRole("region", { name: "Replay results" }));
        expect(replay.getByText("0 × 5 + 5")).toBeTruthy();
        expect(replay.getByRole("img").getAttribute("aria-label")).toBe("No replay rounds yet.");
        expect(replay.getByText("No rounds yet")).toBeTruthy();
        const [, reviewer] = screen.getAllByRole("region", { name: "AI reviewer" });
        expect(within(reviewer).getByText("not the verdict")).toBeTruthy();
        expect(within(reviewer).getByRole("status").textContent).toBe("No explanation yet");
        expect(within(screen.getByRole("region", { name: "Verdict" })).getByText("bad input")).toBeTruthy();
    });

    it("titles the tab with a stored incident", async () => {
        vi.mocked(getIncident).mockResolvedValueOnce(INCIDENT_DETAIL);
        expect(await generateMetadata(props(incident.id))).toEqual({ title: incident.title });
    });
});
