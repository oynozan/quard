import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENTS } from "@/lib/data/agents";
import { stubResizeObserver } from "../../../test/approvals-overview/fixtures";
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

describe("OverviewRail", () => {
    it("counts the running agents and fills the meter to match", () => {
        render(<OverviewRail agents={AGENTS} guardCounts={GUARDS} />);
        const rail = within(screen.getByRole("complementary", { name: "Fleet summary" }));
        expect(rail.getByText("3 / 6")).toBeTruthy();
        const meter = rail.getByRole("progressbar", { name: "3 of 6 agents running" });
        expect(meter.getAttribute("aria-valuenow")).toBe("3");
        expect(meter.getAttribute("aria-valuemax")).toBe("6");
    });

    it("shows the version of a running agent and the state of the others", () => {
        render(<OverviewRail agents={AGENTS} guardCounts={GUARDS} />);
        const rows = within(screen.getAllByRole("list")[0])
            .getAllByRole("listitem")
            .map((item) => item.textContent);
        expect(rows).toEqual([
            "orchestratorv14",
            "researcherv9",
            "billingv22",
            "supportIdle",
            "inbox-triageIdle",
            "deploy-botOffline",
        ]);
    });

    it("lists guard counts by type with thousands separators", () => {
        const { container } = render(<OverviewRail agents={AGENTS} guardCounts={GUARDS} />);
        const pairs = [...container.querySelectorAll("dl > div")].map((row) => row.textContent);
        expect(pairs).toEqual(["source2,140", "approval41"]);
    });

    it("shows zero of zero with an empty meter when no agents report", () => {
        render(<OverviewRail agents={[]} guardCounts={[]} />);
        expect(screen.getByText("0 / 0")).toBeTruthy();
        expect(screen.getByRole("progressbar", { name: "0 of 0 agents running" })).toBeTruthy();
        expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    });
});
