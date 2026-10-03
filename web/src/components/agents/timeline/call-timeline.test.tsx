import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentCall, CALLS } from "../../../../test/agents-graph-timeline/fixtures";
import { stubResizeObserver } from "../../../../test/agents-graph-timeline/resize";
import { CallTimeline } from "./call-timeline";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

beforeEach(stubResizeObserver);
afterEach(() => {
    vi.unstubAllGlobals();
});

// The legend also says "Blocked" and "Asked", so pick the label that has a mono value beside it
function readout(label: string): string | null | undefined {
    const value = screen.getAllByText(label).map((item) => item.nextElementSibling);
    return value.find((item) => item?.classList.contains("mono"))?.textContent;
}

function legend(): HTMLElement {
    return screen.getByText("Legend:").parentElement as HTMLElement;
}

describe("CallTimeline", () => {
    it("counts untrusted context, asks and blocks among the recent calls", () => {
        render(<CallTimeline name="planner" calls={CALLS} />);
        expect(screen.getByRole("region", { name: "Recent calls" }).textContent).toContain("LAST 6");
        expect(readout("Untrusted context")).toBe("2");
        expect(readout("Asked")).toBe("1");
        expect(readout("Blocked")).toBe("2");
    });

    it("describes the time span, the untrusted calls and the blocks", () => {
        render(<CallTimeline name="planner" calls={CALLS} />);
        const summary =
            "The last 6 calls by planner, from 12:00:00 to 12:00:50 UTC. " +
            "2 ran with untrusted content in context, and guards blocked 2.";
        expect(screen.getByRole("img", { name: summary })).toBeTruthy();
    });

    it("lists every context and each guard mark the calls carry, in a fixed order", () => {
        render(<CallTimeline name="planner" calls={CALLS} />);
        expect(legend().textContent).toBe(
            "Legend:Trusted publicTrusted internalUntrusted publicUntrusted internalBlockedAskedWould blockWould ask",
        );
        expect(legend().querySelectorAll(".w-px")).toHaveLength(1);
        const holes = legend().querySelectorAll('rect[fill="var(--page)"]');
        expect(holes).toHaveLength(2);
        const outlined = [...legend().querySelectorAll('rect[fill="none"]')];
        expect(outlined.map((rect) => rect.getAttribute("stroke"))).toEqual(["var(--danger)", "var(--warning)"]);
    });

    it("leaves the marks out of the legend when no guard stepped in, and speaks of one call", () => {
        render(<CallTimeline name="planner" calls={[agentCall("s1", { name: "draft" })]} />);
        expect(legend().textContent).toBe("Legend:Trusted publicTrusted internalUntrusted publicUntrusted internal");
        expect(legend().querySelectorAll(".w-px")).toHaveLength(0);
        const summary =
            "The last 1 call by planner, from 12:00:00 to 12:00:00 UTC. " +
            "0 ran with untrusted content in context, and guards blocked 0.";
        expect(screen.getByRole("img", { name: summary })).toBeTruthy();
    });

    it("lists every call newest first behind the Table toggle", () => {
        render(<CallTimeline name="planner" calls={CALLS} />);
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        const table = screen.getByRole("table", { name: "The last 6 calls by planner, newest first" });
        const rows = within(table).getAllByRole("row").slice(1);
        expect(rows.map((row) => [...row.children].map((cell) => cell.textContent))).toEqual([
            ["12:00:50", "Tool call", "send_email", "Untrusted public · web", "Blocked", "120 ms", "runs6-00"],
            ["12:00:40", "Guard decision", "egress", "Trusted public · user", "Asked", "120 ms", "runs5-00"],
            ["12:00:30", "Tool call", "delete_file", "Trusted public · user", "Would block", "120 ms", "runs4-00"],
            ["12:00:20", "Approval", "refund", "Trusted public · user", "Would ask", "120 ms", "runs3-00"],
            // Blocked without a guard outcome, so the Guard column has no word
            ["12:00:10", "Memory write", "notes", "Untrusted internal · crm", "—", "2.4 s", "runs2-00"],
            ["12:00:00", "Model call", "draft", "Trusted internal · kb", "Allowed", "120 ms", "runs1-00"],
        ]);
    });

    it("says the agent has made no calls yet when there are none", () => {
        render(<CallTimeline name="planner" calls={[]} />);
        expect(screen.getByText("planner has made no calls yet")).toBeTruthy();
        expect(screen.getByRole("region", { name: "Recent calls" }).textContent).toContain("LAST 0");
        expect(screen.queryByRole("img")).toBeNull();
        expect(readout("Blocked")).toBe("—");
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        expect(screen.getByText("No calls yet")).toBeTruthy();
    });
});
