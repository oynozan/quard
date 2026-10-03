import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { START, UNTRUSTED_PUBLIC, makeGuard, makeStep } from "../../../../../test/runs-timeline-lib/steps";
import { StepTable } from "./step-table";

function steps() {
    return [
        makeStep({ name: "gpt-5.4-mini", startedAt: START + 420, durationMs: 950 }),
        makeStep({
            name: "fetchPage",
            kind: "tool_call",
            agent: "researcher",
            startedAt: START + 9240,
            durationMs: 1500,
            context: UNTRUSTED_PUBLIC,
            guard: makeGuard({ outcome: "flag", guard: "source" }),
        }),
        makeStep({ name: "payInvoice", kind: "tool_call", startedAt: START + 255_400, status: "error" }),
    ];
}

function cells(row: HTMLElement): string[] {
    return [...row.querySelectorAll("td, th")].map((cell) => cell.textContent ?? "");
}

describe("StepTable", () => {
    it("labels its columns, with the times aligned right", () => {
        render(<StepTable steps={steps()} startedAt={START} height={260} onOpen={() => {}} />);
        const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
        expect(headers).toEqual(["#", "Step", "Agent", "Kind", "At", "Took", "Context", "Decision", "Open"]);
        expect(screen.getByRole("columnheader", { name: "At" }).className).toContain("text-right");
        expect(screen.getByRole("columnheader", { name: "Took" }).className).toContain("text-right");
        expect(screen.getByRole("columnheader", { name: "Agent" }).className).not.toContain("text-right");
        expect(screen.getByRole("table", { name: "Steps of this run in time order" })).toBeTruthy();
    });

    it("shows each step in time order with its offset, duration, context and decision", () => {
        render(<StepTable steps={steps()} startedAt={START} height={300} onOpen={() => {}} />);
        const rows = screen.getAllByRole("row").slice(1);
        expect(rows.map(cells)).toEqual([
            ["1", "gpt-5.4-mini", "billing", "Model call", "0.42 s", "950 ms", "Trusted internal", "—", ""],
            ["2", "fetchPage", "researcher", "Tool call", "9.2 s", "1.5 s", "Untrusted public", "Flagged", ""],
            ["3", "payInvoice", "billing", "Tool call", "4 min 15 s", "400 ms", "Trusted internal", "Failed", ""],
        ]);
    });

    it("opens the step whose name is clicked", () => {
        const onOpen = vi.fn();
        render(<StepTable steps={steps()} startedAt={START} height={300} onOpen={onOpen} />);
        fireEvent.click(screen.getByRole("button", { name: "fetchPage" }));
        expect(onOpen).toHaveBeenCalledWith(1);
    });

    it("caps its height so long runs scroll", () => {
        const { container } = render(<StepTable steps={steps()} startedAt={START} height={340} onOpen={() => {}} />);
        expect((container.firstChild as HTMLElement).style.maxHeight).toBe("340px");
        expect(screen.queryByText("No steps yet")).toBeNull();
    });

    it("keeps its header row and says so when the run has no steps", () => {
        render(<StepTable steps={[]} startedAt={START} height={260} onOpen={() => {}} />);
        expect(screen.getAllByRole("columnheader")).toHaveLength(9);
        expect(screen.getAllByRole("row")).toHaveLength(1);
        expect(screen.getByText("No steps yet")).toBeTruthy();
    });
});
