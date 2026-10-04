import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubResizeObserver } from "../../../test/overview/browser";
import { AGENTS, QUIET } from "../../../test/overview/fixtures";
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

        expect(rail().getByText("2 / 3")).toBeTruthy();
        const meter = rail().getByRole("progressbar", { name: "2 of 3 agents running" });
        expect(meter.getAttribute("aria-valuenow")).toBe("2");
        expect(meter.getAttribute("aria-valuemax")).toBe("3");
    });

    it("shows each agent's state beside its name", () => {
        render(<OverviewRail agents={AGENTS} guardCounts={GUARDS} />);
        const rows = within(screen.getByRole("list"))
            .getAllByRole("listitem")
            .map((item) => item.textContent);

        expect(rows).toEqual(["billingRunning", "researcherRunning", "supportIdle"]);
    });

    it("keeps the meter when agents were seen but none is running", () => {
        const idle = AGENTS.map((agent) => ({ ...agent, state: "idle" as const }));
        render(<OverviewRail agents={idle} guardCounts={GUARDS} />);

        expect(rail().getByText("0 / 3")).toBeTruthy();
        expect(rail().getByRole("progressbar", { name: "0 of 3 agents running" })).toBeTruthy();
    });

    it("lists guard counts by type with thousands separators", () => {
        const { container } = render(<OverviewRail agents={AGENTS} guardCounts={GUARDS} />);
        const pairs = [...container.querySelectorAll("dl > div")].map((row) => row.textContent);

        expect(pairs).toEqual(["source2,140", "approval41"]);
    });

    it("keeps both sections with zero of zero, an empty meter and every guard at 0", () => {
        const { container } = render(<OverviewRail agents={[]} guardCounts={QUIET.guardCounts} />);

        expect(
            rail()
                .getAllByRole("heading")
                .map((heading) => heading.textContent),
        ).toEqual(["Agents", "Guards"]);
        expect(rail().getByText("Running").nextElementSibling?.textContent).toBe("0 / 0");
        const meter = rail().getByRole("progressbar", { name: "0 of 0 agents running" });
        expect(meter.getAttribute("aria-valuenow")).toBe("0");
        expect(meter.querySelector('path[fill="var(--progress-fill, var(--signal))"]')?.getAttribute("d")).toBe("");
        expect(rail().queryAllByRole("listitem")).toHaveLength(0);
        const pairs = [...container.querySelectorAll("dl > div")].map((row) => row.textContent);
        expect(pairs).toEqual(["source0", "action0", "egress0", "limit0", "approval0", "permission0", "signature0"]);
    });
});
