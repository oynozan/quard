import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoChartsOrTables } from "../../../test/empty";
import { stubBrowser } from "../../../test/fleet-shell/env";
import { SOURCES, TOOLS, emptyFleet } from "../../../test/summary/fleet";
import { IncidentPanes } from "./incident-panes";

function section() {
    return screen.getByRole("region", { name: "Where incidents start" });
}

function chart(name: string) {
    return within(screen.getByRole("region", { name })).getByRole("img");
}

// The section heading, with its count chip when there is one
function title() {
    return screen.getByRole("heading", { level: 2, name: /^Where incidents start/ });
}

// The tile grid sits under the heading
function grid() {
    return section().lastElementChild?.className.split(" ") ?? [];
}

beforeEach(stubBrowser);
afterEach(() => vi.unstubAllGlobals());

describe("IncidentPanes", () => {
    it("counts all incidents and the ones that came from untrusted sources, side by side", () => {
        render(<IncidentPanes fleet={emptyFleet({ incidentsBySource: SOURCES, incidentsByTool: TOOLS })} />);

        expect(title().textContent).toBe("Where incidents start1205");
        expect(screen.getByRole("region", { name: "By entry source" }).textContent).toContain(
            "Untrusted1,203incidents",
        );
        expect(chart("By entry source").getAttribute("aria-label")).toBe(
            "Incidents by the source where they entered over the last 30 days. web page leads with 1,200 incidents, out of 3.",
        );
        expect(chart("By damaging tool").getAttribute("aria-label")).toBe(
            "Incidents by the tool call that did the damage over the last 30 days. send_payment leads with 1,205 incidents, out of 1.",
        );
        expect(grid()).toContain("grid-cols-2");
    });

    it("draws only the sources, full width, when no damaging tool is known", () => {
        render(<IncidentPanes fleet={emptyFleet({ incidentsBySource: SOURCES })} />);

        expect(title().textContent).toBe("Where incidents start1205");
        expect(chart("By entry source")).toBeTruthy();
        expect(screen.queryByRole("region", { name: "By damaging tool" })).toBeNull();
        expect(grid()).not.toContain("grid-cols-2");
    });

    it("draws only the tools, with no count chip, when no entry source is known", () => {
        render(<IncidentPanes fleet={emptyFleet({ incidentsByTool: TOOLS })} />);

        expect(title().textContent).toBe("Where incidents start");
        expect(chart("By damaging tool")).toBeTruthy();
        expect(screen.queryByRole("region", { name: "By entry source" })).toBeNull();
    });

    it("shows one line and no charts when there were no incidents", () => {
        render(<IncidentPanes fleet={emptyFleet()} />);

        expect(title().textContent).toBe("Where incidents start");
        expect(within(section()).getByRole("status").textContent).toBe("No incidents in the last 30 days");
        expectNoChartsOrTables(section());
    });

    it("shows only its title and a small bar while the summary loads", () => {
        render(<IncidentPanes fleet={null} />);

        expect(section().getAttribute("aria-busy")).toBe("true");
        expect(title().textContent).toBe("Where incidents start");
        expect(within(section()).queryByRole("img")).toBeNull();
    });
});
