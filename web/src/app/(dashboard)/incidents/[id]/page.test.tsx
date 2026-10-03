import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../../../test/auth-app/browser";
import { listIncidents } from "@/lib/data/incidents/query";
import { NOW } from "@/lib/data/rng";
import { formatAge, formatLongDate } from "@/lib/format";
import IncidentPage, { generateMetadata } from "./page";

vi.mock("next/navigation", () => ({
    notFound: () => {
        throw new Error("not found");
    },
}));

const props = (id: string) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });

describe("IncidentPage", () => {
    beforeEach(() => {
        stubBrowser();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("shows the incident with links back to the list and on to its run", async () => {
        const [incident] = await listIncidents();
        render(await IncidentPage(props(incident!.id)));
        expect(screen.getByRole("heading", { level: 1, name: incident!.title })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Incidents" }).getAttribute("href")).toBe("/incidents");
        expect(screen.getByRole("link", { name: "Open run" }).getAttribute("href")).toBe(`/runs/${incident!.runId}`);
        const opened = screen.getByTitle(formatLongDate(incident!.openedAt));
        expect(opened.textContent).toBe(`Opened ${formatAge(incident!.openedAt, NOW)} ago`);
        expect(screen.getByRole("region", { name: "Replay" })).toBeTruthy();
    });

    it("shows the not-found page for an unknown id", async () => {
        await expect(IncidentPage(props("inc_missing"))).rejects.toThrow("not found");
    });

    it("titles the tab with the incident, or says it is missing", async () => {
        const [incident] = await listIncidents();
        expect(await generateMetadata(props(incident!.id))).toEqual({ title: incident!.title });
        expect(await generateMetadata(props("inc_missing"))).toEqual({ title: "Incident not found" });
    });
});
