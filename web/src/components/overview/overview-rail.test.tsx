import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoChartsOrTables } from "../../../test/empty";
import { stubResizeObserver } from "../../../test/overview/browser";
import { AGENTS } from "../../../test/overview/fixtures";
import { OverviewRail } from "./overview-rail";

const GUARDS = [
    { type: "source", count: 2140 },
    { type: "approval", count: 41 },
];

beforeEach(() => {
    stubResizeObserver();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const rail = () => within(screen.getByRole("complementary", { name: "Fleet summary" }));

describe("OverviewRail", () => {
    it("counts the running agents and fills the meter to match", () => {
        render(<OverviewRail agents={AGENTS} guardCounts={GUARDS} />);

        expect(rail().getByText("2 / 4")).toBeTruthy();
        const meter = rail().getByRole("progressbar", { name: "2 of 4 agents running" });
        expect(meter.getAttribute("aria-valuenow")).toBe("2");
        expect(meter.getAttribute("aria-valuemax")).toBe("4");
    });

    it("shows each agent's state beside its name", () => {
        render(<OverviewRail agents={AGENTS} guardCounts={GUARDS} />);
        const rows = within(screen.getByRole("list"))
            .getAllByRole("listitem")
            .map((item) => item.textContent);

        expect(rows).toEqual(["billingRunning", "researcherRunning", "supportIdle", "deploy-botOffline"]);
    });

    it("keeps the meter when agents were seen but none is running", () => {
        const idle = AGENTS.map((agent) => ({ ...agent, state: "idle" as const }));
        render(<OverviewRail agents={idle} guardCounts={GUARDS} />);

        expect(rail().getByText("0 / 4")).toBeTruthy();
        expect(rail().getByRole("progressbar", { name: "0 of 4 agents running" })).toBeTruthy();
    });

    it("lists guard counts by type with thousands separators", () => {
        const { container } = render(<OverviewRail agents={AGENTS} guardCounts={GUARDS} />);
        const pairs = [...container.querySelectorAll("dl > div")].map((row) => row.textContent);

        expect(pairs).toEqual(["source2,140", "approval41"]);
    });

    it("shows each title and one line when no agent or guard has data", () => {
        const { container } = render(<OverviewRail agents={[]} guardCounts={[]} />);

        expect(
            rail()
                .getAllByRole("heading")
                .map((heading) => heading.textContent),
        ).toEqual(["Agents", "Guards"]);
        expect(
            rail()
                .getAllByRole("status")
                .map((line) => line.textContent),
        ).toEqual(["No agents in the last 30 days", "No guard decisions in the last 24 hours"]);
        expect(screen.queryByText("Running")).toBeNull();
        expect(screen.queryByRole("list")).toBeNull();
        expect(container.querySelector("dl")).toBeNull();
        expectNoChartsOrTables(container);
    });
});
