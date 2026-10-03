import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { matchOf, RUN_A, RUN_B, runOf } from "../../../../test/incidents-search/search";
import { IBAN_MASK } from "../../../../test/search/events";
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
                label: null,
                match: "name",
            }),
        ],
    },
    {
        runId: RUN_B,
        run: runOf({ id: RUN_B, status: "completed", rootAgent: "support" }),
        matches: [matchOf({ runId: RUN_B, stepId: "s7", match: "inside" })],
    },
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
        const other = within(group("c3a8f0d2")).getAllByRole("row");
        expect(other[0].textContent).toBe("Run c3a8f0d2CompletedStarted by support · 3 Oct, 12:001 match");
        expect(other).toHaveLength(2);
    });

    it("shows each match as a row that opens its step", () => {
        render(<SearchResults groups={GROUPS} />);
        const link = screen.getByRole("link", { name: "payInvoice by billing, step s3, in run 4bf92f35" });
        expect(link.getAttribute("href")).toBe(`/runs/${RUN_A}?step=s3`);
        const cells = within(link.closest("tr") as HTMLElement).getAllByRole("cell");
        expect(cells.map((cell) => cell.textContent)).toEqual([
            "payInvoice",
            "billing",
            "iban",
            `${IBAN_MASK}exact`,
            "web:example.netuntrusted",
            "12:00:05",
        ]);
        expect(cells[5].getAttribute("title")).toBe("3 October 2026 at 12:00");
        expect(cells[1].getAttribute("title")).toBe("billing");
    });

    it("names an agent's start and how the value matched, with no label chip for a name", () => {
        render(<SearchResults groups={GROUPS} />);
        const link = screen.getByRole("link", { name: "Agent started by researcher, step s1, in run 4bf92f35" });
        const cells = within(link.closest("tr") as HTMLElement).getAllByRole("cell");
        expect(cells[3].textContent).toBe("researcherby name");
        expect(cells[4].textContent).toBe("");
        const inside = screen.getByRole("link", { name: "payInvoice by billing, step s7, in run c3a8f0d2" });
        expect(within(inside.closest("tr") as HTMLElement).getByText("inside a value")).toBeTruthy();
    });
});
