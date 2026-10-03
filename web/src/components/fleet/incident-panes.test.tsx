import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../test/fleet-shell/env";
import { expectEmptyChart } from "../../../test/summary/frames";
import { SOURCES, TOOLS, emptyFleet } from "../../../test/summary/fleet";
import { IncidentPanes } from "./incident-panes";

const EMPTY = "No incidents in the last 30 days";

function chart(name: string) {
    return within(screen.getByRole("region", { name })).getByRole("img");
}

// The section heading, with its count chip when there is one
function title() {
    return screen.getByRole("heading", { level: 2, name: /^Where incidents start/ });
}

// The tile grid sits under the heading
function grid() {
    return screen.getByRole("region", { name: "Where incidents start" }).lastElementChild?.className.split(" ") ?? [];
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

    it("keeps both panes side by side, unlit and with a dash for untrusted, when there were no incidents", () => {
        render(<IncidentPanes fleet={emptyFleet()} />);

        expect(title().textContent).toBe("Where incidents start0");
        expect(expectEmptyChart("By entry source", EMPTY).textContent).toContain("Untrusted—incidents");
        expectEmptyChart("By damaging tool", EMPTY);
        expect(grid()).toContain("grid-cols-2");
    });

    it("keeps the damaging tool pane unlit when only the entry sources are known", () => {
        render(<IncidentPanes fleet={emptyFleet({ incidentsBySource: SOURCES })} />);

        expect(title().textContent).toBe("Where incidents start1205");
        expect(chart("By entry source").getAttribute("aria-label")).toContain("web page leads with 1,200 incidents");
        expectEmptyChart("By damaging tool", EMPTY);
    });

    it("counts one untrusted incident in the singular", () => {
        render(<IncidentPanes fleet={emptyFleet({ incidentsBySource: [{ ...SOURCES[0], count: 1 }] })} />);

        expect(screen.getByRole("region", { name: "By entry source" }).textContent).toMatch(/Untrusted1incident(?!s)/);
        expect(chart("By entry source").getAttribute("aria-label")).toContain("web page leads with 1 incident,");
    });

    it("shows both charts loading and no count while the summary loads", () => {
        render(<IncidentPanes fleet={null} />);

        expect(title().textContent).toBe("Where incidents start");
        expect(chart("By entry source").getAttribute("aria-label")).toBe("By entry source, loading");
        expect(chart("By damaging tool").getAttribute("aria-label")).toBe("By damaging tool, loading");
        expect(screen.getByRole("region", { name: "By entry source" }).getAttribute("aria-busy")).toBe("true");
        expect(screen.queryByText(EMPTY)).toBeNull();
    });
});
