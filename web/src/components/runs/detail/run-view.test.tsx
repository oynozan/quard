import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalInfo } from "@/lib/data/runs/types";
import { expectNoChartsOrTables } from "../../../../test/empty";
import { makeAgent, makeDetail, makeGuard, makeRow, makeStep } from "../../../../test/runs-detail-list/fixtures";
import { RunView } from "./run-view";

// The timeline sizes itself with ResizeObserver, which jsdom lacks.
class StillObserver {
    observe() {}
    disconnect() {}
}

beforeEach(() => vi.stubGlobal("ResizeObserver", StillObserver));
afterEach(() => vi.unstubAllGlobals());

const waitingApproval: ApprovalInfo = {
    requestId: "ap-7",
    state: "waiting",
    by: null,
    decidedAt: null,
    argsHash: "h",
};

// The guard decisions tile, read as one line.
function decisions(): string | null | undefined {
    return screen.getByText("Guard decisions").nextElementSibling?.textContent;
}

// The row that holds the run graph and the limits
function graphRow(): HTMLElement {
    return screen.getByRole("region", { name: "Run graph" }).parentElement!;
}

describe("RunView", () => {
    it("lays out the heading, summary, timeline, graph and limits of a finished run", () => {
        const { container } = render(<RunView run={makeDetail()} />);
        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Run abcdef01");
        expect(screen.getByLabelText("Run summary")).toBeTruthy();
        expect(screen.getByRole("region", { name: "Timeline" })).toBeTruthy();
        expect(screen.getByRole("region", { name: "Run limits" })).toBeTruthy();
        // The limits sit in a column beside the graph
        expect(graphRow().className).toContain("grid-cols-[minmax(0,1fr)_268px]");
        expect(container.textContent).toContain("Took 1 min 15 s");
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("shows a run that has only started as its heading, summary, graph and one timeline line", () => {
        const agent = makeAgent({ name: "billing", version: "", model: "" });
        const run = makeDetail({
            summary: makeRow({ steps: 0, costUsd: 0, decisions: { allowed: 0, asked: 0, blocked: 0 } }),
            agents: [agent],
            graph: { nodes: [agent], edges: [] },
            steps: [],
            limits: [],
        });
        render(<RunView run={run} />);
        expect(screen.getByRole("region", { name: "Timeline" }).textContent).toBe("TimelineNo steps yet");
        expect(screen.queryByRole("region", { name: "Run limits" })).toBeNull();
        // Without limits the graph takes the whole width
        expect(graphRow().className).not.toContain("grid");
        expect(decisions()).toBe("0allowed");
        expectNoChartsOrTables();
    });

    it("links to the approval from the heading when no step is waiting", () => {
        render(<RunView run={makeDetail({ summary: makeRow({ approvalId: "ap-7" }) })} />);
        expect(screen.getByRole("link", { name: "Open approval" }).getAttribute("href")).toBe("/approvals#ap-7");
        expect(screen.queryByRole("link", { name: "Review in Approvals" })).toBeNull();
    });

    it("moves the approval link into the callout while a step waits for a human", () => {
        const run = makeDetail({
            summary: makeRow({ status: "waiting", approvalId: "ap-7" }),
            steps: [makeStep({ kind: "approval", name: "payInvoice", approval: waitingApproval })],
        });
        const { container } = render(<RunView run={run} />);
        expect(screen.queryByRole("link", { name: "Open approval" })).toBeNull();
        expect(screen.getByRole("link", { name: "Review in Approvals" }).getAttribute("href")).toBe("/approvals#ap-7");
        expect(container.textContent).toContain("Running for 1 min 15 s");
    });

    it("counts a running run as still open", () => {
        const { container } = render(<RunView run={makeDetail({ summary: makeRow({ status: "running" }) })} />);
        expect(container.textContent).toContain("Running for 1 min 15 s");
    });

    it("counts what observe-mode rules would have blocked or asked", () => {
        const steps = [
            makeStep({ id: "1", guard: makeGuard({ mode: "observe", outcome: "block" }) }),
            makeStep({ id: "2", guard: makeGuard({ mode: "observe", outcome: "ask" }) }),
            makeStep({ id: "3", guard: makeGuard({ mode: "observe", outcome: "allow" }) }),
            makeStep({ id: "4", guard: makeGuard({ mode: "block", outcome: "block" }) }),
            makeStep({ id: "5" }),
        ];
        const summary = makeRow({ decisions: { allowed: 3, asked: 0, blocked: 1 } });
        render(<RunView run={makeDetail({ summary, steps })} />);
        expect(decisions()).toBe("1blocked1would block1would ask1allowed");
    });

    it("opens the step named in the link in the drawer", () => {
        const steps = [makeStep({ id: "a1" }), makeStep({ id: "b2", name: "fetchPage", kind: "tool_call" })];
        render(<RunView run={makeDetail({ steps })} step="b2" />);
        expect(screen.getByRole("dialog")).toBeTruthy();
        expect(screen.getByRole("heading", { level: 2, name: "fetchPage" })).toBeTruthy();
    });
});
