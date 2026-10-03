import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { matchOf, RUN_A, RUN_B, runOf } from "../../../../test/incidents-search/search";
import { SearchList } from "./search-list";

const GROUPS = [
    {
        runId: RUN_A,
        run: runOf({ status: "completed" }),
        matches: [matchOf({ stepId: "s3" }), matchOf({ stepId: "s4", field: "note", value: "DE89…3000 again" })],
    },
    {
        runId: RUN_B,
        run: null,
        matches: [matchOf({ runId: RUN_B, stepId: "s1", tool: "", field: "brief", match: "text" })],
    },
];

describe("SearchList", () => {
    it("heads each run with its link, status, count and starter", () => {
        render(<SearchList groups={GROUPS} />);
        const run = screen.getByRole("region", { name: "Run 4bf92f35" });
        const header = run.querySelector("header") as HTMLElement;
        expect(header.textContent).toBe("Run 4bf92f35Completed2 matchesStarted by researcher · 3 Oct, 12:00");
        expect(within(header).getByRole("link").getAttribute("href")).toBe(`/runs/${RUN_A}`);
        expect(within(run).getAllByRole("listitem")).toHaveLength(2);
    });

    it("says when a run's details have expired", () => {
        render(<SearchList groups={GROUPS} />);
        const run = screen.getByRole("region", { name: "Run c3a8f0d2" });
        expect(run.querySelector("header")?.textContent).toBe("Run c3a8f0d21 matchRun details expired");
    });

    it("stacks each match with its time, field, value and label, linking to the step", () => {
        render(<SearchList groups={GROUPS} />);
        const link = screen.getByRole("link", { name: "pay_invoice by billing, step s3" });
        expect(link.getAttribute("href")).toBe(`/runs/${RUN_A}?step=s3`);
        const item = link.closest("li") as HTMLElement;
        expect(item.textContent).toBe(
            "pay_invoice12:00:05billing · iban · exactDE89…3000supplier-portal.exampleuntrusted",
        );
        expect(within(item).getByText("12:00:05").getAttribute("title")).toBe("3 October 2026 at 12:00");
    });

    it("names a step without a tool", () => {
        render(<SearchList groups={GROUPS} />);
        const link = screen.getByRole("link", { name: "Step by billing, step s1" });
        expect(link.closest("li")?.textContent).toContain("billing · brief · contains");
    });
});
