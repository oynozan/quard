import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FleetData } from "@/lib/data/fleet";
import { sampleFleet, stubBrowser } from "../../../test/fleet-shell/env";
import { IncidentPanes } from "./incident-panes";

const web = { origin: "web page", trust: "untrusted", sensitivity: "public" } as const;
const user = { origin: "user", trust: "trusted", sensitivity: "internal" } as const;

const SOURCES: FleetData["incidentsBySource"] = [
    { origin: "web page", label: web, count: 1200 },
    { origin: "user", label: user, count: 2 },
    { origin: "email", label: { ...web, origin: "email" }, count: 3 },
];
const TOOLS: FleetData["incidentsByTool"] = [{ tool: "send_payment", count: 1205 }];

function chart(name: string) {
    return within(screen.getByRole("region", { name })).getByRole("img");
}

beforeEach(stubBrowser);
afterEach(() => vi.unstubAllGlobals());

describe("IncidentPanes", () => {
    it("shows both charts loading and no count while the fleet loads", () => {
        render(<IncidentPanes fleet={null} />);
        expect(screen.getByRole("heading", { level: 2, name: "Where incidents start" }).textContent).toBe(
            "Where incidents start",
        );
        expect(chart("By entry source").getAttribute("aria-label")).toBe("By entry source, loading");
        expect(chart("By damaging tool").getAttribute("aria-label")).toBe("By damaging tool, loading");
    });

    it("counts all incidents and the ones that came from untrusted sources", async () => {
        render(<IncidentPanes fleet={await sampleFleet({ incidentsBySource: SOURCES, incidentsByTool: TOOLS })} />);
        expect(screen.getByRole("heading", { name: /^Where incidents start/ }).textContent).toBe(
            "Where incidents start1205",
        );
        expect(screen.getByRole("region", { name: "By entry source" }).textContent).toContain(
            "Untrusted1,203incidents",
        );
        expect(chart("By entry source").getAttribute("aria-label")).toBe(
            "Incidents by the source where they entered over the last 30 days. web page leads with 1,200 incidents, out of 3.",
        );
        expect(chart("By damaging tool").getAttribute("aria-label")).toBe(
            "Incidents by the tool call that did the damage over the last 30 days. send_payment leads with 1,205 incidents, out of 1.",
        );
    });

    it("says there were no incidents when the lists are empty", async () => {
        render(<IncidentPanes fleet={await sampleFleet({ incidentsBySource: [], incidentsByTool: [] })} />);
        expect(screen.getByRole("heading", { name: /^Where incidents start/ }).textContent).toBe(
            "Where incidents start0",
        );
        expect(screen.getByRole("region", { name: "By entry source" }).textContent).toContain("Untrusted0incidents");
        expect(chart("By damaging tool").getAttribute("aria-label")).toBe("No incidents in the last 30 days");
    });
});
