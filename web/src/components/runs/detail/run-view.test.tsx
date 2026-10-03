import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDetailOf } from "@/lib/data/runs/live/detail";
import type { ApprovalInfo } from "@/lib/data/runs/types";
import { makeAgent, makeDetail, makeGuard, makeRow, makeStep } from "../../../../test/runs-detail-list/fixtures";
import { ASK, at, REQUEST, runWaiter, storedWaitingRun } from "../../../../test/runs-fixture";
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

// The stored run while payInvoice has waited a minute for a person, as the run page reads it
function waitingRun() {
    return runDetailOf(storedWaitingRun(), at(66).getTime(), [runWaiter({ lastBeatAt: at(60) })]);
}

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

    it("keeps every pane for a run that has only started, with an empty timeline and no limits", () => {
        const agent = makeAgent({ name: "billing", version: "", model: "" });
        const run = makeDetail({
            summary: makeRow({ steps: 0, costUsd: 0, decisions: { allowed: 0, asked: 0, blocked: 0 } }),
            agents: [agent],
            graph: { nodes: [agent], edges: [] },
            steps: [],
            limits: [],
        });
        render(<RunView run={run} />);
        const timeline = screen.getByRole("region", { name: "Timeline" });
        expect(within(timeline).getByRole("button", { name: "Table" })).toBeTruthy();
        expect(within(timeline).getByText("Untrusted context").parentElement!.textContent).toBe(
            "Untrusted context—steps",
        );
        expect(within(timeline).getByRole("img", { name: "No steps yet" }).textContent).toBe("billingNo steps yet");
        expect(within(timeline).getByText("Legend:")).toBeTruthy();
        expect(screen.getByRole("region", { name: "Run graph" })).toBeTruthy();
        expect(screen.getByRole("region", { name: "Run limits" }).textContent).toBe("Run limitsNo limits reported");
        // The limits keep their column beside the graph
        expect(graphRow().className).toContain("grid-cols-[minmax(0,1fr)_268px]");
        expect(decisions()).toBe("0allowed");
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

    it("shows a stored run's waiting call in the callout, linked to its request", () => {
        const { container } = render(<RunView run={waitingRun()} />);
        expect(container.textContent).toContain("payInvoice by billing is waiting for a human · 1 min 0 s");
        expect(container.textContent).toContain("Running for 1 min 6 s");
        const review = screen.getByRole("link", { name: "Review in Approvals" });
        expect(review.getAttribute("href")).toBe(`/approvals#${REQUEST}`);
        expect(screen.queryByRole("link", { name: "Open approval" })).toBeNull();
    });

    it("opens a stored run's waiting call in the drawer, with a link to answer it", () => {
        render(<RunView run={waitingRun()} step={ASK} />);
        const drawer = screen.getByRole("dialog");
        expect(within(drawer).getByRole("heading", { level: 2, name: "payInvoice" })).toBeTruthy();
        expect(drawer.textContent).toContain("1 min 0 s so far");
        const answer = within(drawer).getByRole("link", { name: "Answer in Approvals" });
        expect(answer.getAttribute("href")).toBe(`/approvals#${REQUEST}`);
    });

    it("opens the step named in the link in the drawer", () => {
        const steps = [makeStep({ id: "a1" }), makeStep({ id: "b2", name: "fetchPage", kind: "tool_call" })];
        render(<RunView run={makeDetail({ steps })} step="b2" />);
        expect(screen.getByRole("dialog")).toBeTruthy();
        expect(screen.getByRole("heading", { level: 2, name: "fetchPage" })).toBeTruthy();
    });
});
