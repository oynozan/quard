import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ApprovalInfo } from "@/lib/data/runs/types";
import { makeDetail, makeRow, makeStep } from "../../../../test/runs-detail-list/fixtures";
import { RunCallout, waitingStep } from "./run-callout";

function approval(state: ApprovalInfo["state"]): ApprovalInfo {
    return { requestId: "req-1", state, by: null, decidedAt: null, argsHash: "h" };
}

const waiting = makeStep({
    id: "w",
    kind: "approval",
    name: "payInvoice",
    agent: "billing",
    durationMs: 95_000,
    approval: approval("waiting"),
});
const answered = makeStep({ id: "d", approval: approval("denied") });

describe("waitingStep", () => {
    it("finds the step that waits for a human, skipping answered approvals", () => {
        expect(waitingStep(makeDetail({ steps: [makeStep(), answered, waiting] }))).toBe(waiting);
        expect(waitingStep(makeDetail({ steps: [makeStep(), answered] }))).toBeUndefined();
    });
});

describe("RunCallout", () => {
    it("shows nothing when no step is waiting", () => {
        const { container } = render(<RunCallout run={makeDetail({ steps: [answered] })} />);
        expect(container.innerHTML).toBe("");
    });

    it("names the waiting step and links to its approval", () => {
        const run = makeDetail({ steps: [waiting], summary: makeRow({ approvalId: "ap-7" }) });
        const { container } = render(<RunCallout run={run} />);
        expect(container.textContent).toBe(
            "payInvoice by billing is waiting for a human · 1 min 35 sReview in Approvals",
        );
        expect(screen.getByRole("link", { name: "Review in Approvals" }).getAttribute("href")).toBe("/approvals#ap-7");
    });

    it("links to the approvals page when the run has no approval id", () => {
        render(<RunCallout run={makeDetail({ steps: [waiting] })} />);
        expect(screen.getByRole("link", { name: "Review in Approvals" }).getAttribute("href")).toBe("/approvals");
    });
});
