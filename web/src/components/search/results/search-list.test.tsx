import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { matchOf, RUN_A, RUN_B, runOf } from "../../../../test/incidents-search/search";
import { IBAN_MASK } from "../../../../test/search/events";
import { SearchList } from "./search-list";

const GROUPS = [
    {
        runId: RUN_A,
        run: runOf({ status: "completed" }),
        matches: [matchOf({ stepId: "s3" }), matchOf({ stepId: "s4", field: "memo", match: "inside" })],
    },
    {
        runId: RUN_B,
        run: runOf({ id: RUN_B, rootAgent: "support" }),
        matches: [matchOf({ runId: RUN_B, stepId: "s1", tool: "", field: "content", label: null, match: "host" })],
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
        const other = screen.getByRole("region", { name: "Run c3a8f0d2" });
        expect(other.querySelector("header")?.textContent).toBe(
            "Run c3a8f0d2Blocked1 matchStarted by support · 3 Oct, 12:00",
        );
    });

    it("stacks each match with its time, field, value and label, linking to the step", () => {
        render(<SearchList groups={GROUPS} />);
        const link = screen.getByRole("link", { name: "payInvoice by billing, step s3" });
        expect(link.getAttribute("href")).toBe(`/runs/${RUN_A}?step=s3`);
        const item = link.closest("li") as HTMLElement;
        expect(item.textContent).toBe(`payInvoice12:00:05billing · iban · exact${IBAN_MASK}web:example.netuntrusted`);
        expect(within(item).getByText("12:00:05").getAttribute("title")).toBe("3 October 2026 at 12:00");
    });

    it("names a step not stored yet, with no label chip when nothing is known of its source", () => {
        render(<SearchList groups={GROUPS} />);
        const link = screen.getByRole("link", { name: "Step by billing, step s1" });
        expect(link.closest("li")?.textContent).toBe(`Step12:00:05billing · content · same host${IBAN_MASK}`);
    });
});
