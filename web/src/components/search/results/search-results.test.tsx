import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { matchOf, RUN_A, RUN_B, runOf } from "../../../../test/incidents-search/search";
import { SearchResults } from "./search-results";

const GROUPS = [
    {
        runId: RUN_A,
        run: runOf(),
        matches: [
            matchOf({ stepId: "s3" }),
            matchOf({
                stepId: "s1",
                tool: "",
                field: "agent",
                agent: "researcher",
                value: "researcher",
                match: "name",
            }),
        ],
    },
    { runId: RUN_B, run: null, matches: [matchOf({ runId: RUN_B, stepId: "s7", match: "inside" })] },
];

function group(id: string) {
    return screen.getByRole("rowgroup", { name: `Run ${id}` });
}

describe("SearchResults", () => {
    it("heads each run's group with its link, status, starter and count", () => {
        render(<SearchResults groups={GROUPS} />);
        const rows = within(group("4bf92f35")).getAllByRole("row");
        expect(rows[0].textContent).toBe("Run 4bf92f35BlockedStarted by researcher · 3 Oct, 12:002 matches");
        const link = within(rows[0]).getByRole("link", { name: "Run 4bf92f35" });
        expect(link.getAttribute("href")).toBe(`/runs/${RUN_A}`);
    });

    it("says when a run's details have expired", () => {
        render(<SearchResults groups={GROUPS} />);
        const rows = within(group("c3a8f0d2")).getAllByRole("row");
        expect(rows[0].textContent).toBe("Run c3a8f0d2Run details expired1 match");
        expect(rows).toHaveLength(2);
    });

    it("shows each match as a row that opens its step", () => {
        render(<SearchResults groups={GROUPS} />);
        const link = screen.getByRole("link", { name: "pay_invoice by billing, step s3, in run 4bf92f35" });
        expect(link.getAttribute("href")).toBe(`/runs/${RUN_A}?step=s3`);
        const cells = within(link.closest("tr") as HTMLElement).getAllByRole("cell");
        expect(cells.map((cell) => cell.textContent)).toEqual([
            "pay_invoice",
            "billing",
            "iban",
            "DE89…3000exact",
            "supplier-portal.exampleuntrusted",
            "12:00:05",
        ]);
        expect(cells[5].getAttribute("title")).toBe("3 October 2026 at 12:00");
        expect(cells[1].getAttribute("title")).toBe("billing");
    });

    it("names an agent's start and how the value matched", () => {
        render(<SearchResults groups={GROUPS} />);
        const link = screen.getByRole("link", { name: "Agent started by researcher, step s1, in run 4bf92f35" });
        const cells = within(link.closest("tr") as HTMLElement).getAllByRole("cell");
        expect(cells[3].textContent).toBe("researcherby name");
        const inside = screen.getByRole("link", { name: "pay_invoice by billing, step s7, in run c3a8f0d2" });
        expect(within(inside.closest("tr") as HTMLElement).getByText("inside a value")).toBeTruthy();
    });

    it("shows only the column heads when there are no groups", () => {
        render(<SearchResults groups={[]} />);
        expect(screen.getAllByRole("columnheader")).toHaveLength(6);
        expect(screen.queryAllByRole("rowgroup")).toHaveLength(1);
    });
});
