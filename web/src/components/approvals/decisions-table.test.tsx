import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getApprovals } from "@/lib/data/approvals";
import type { ApprovalDecision } from "@/lib/data/approvals";
import { NOW } from "@/lib/data/rng";
import { DecisionsTable } from "./decisions-table";

async function sampleDecisions(): Promise<ApprovalDecision[]> {
    return (await getApprovals()).decisions;
}

function bodyRows() {
    return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}

const segment = (name: RegExp) => screen.getByRole("button", { name });

describe("DecisionsTable", () => {
    it("lists every past answer and counts each kind", async () => {
        const decisions = await sampleDecisions();
        render(<DecisionsTable decisions={decisions} now={NOW} fresh={new Set()} />);
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(`Decided${decisions.length}`);
        expect(segment(/^All/).textContent).toBe("All40");
        expect(segment(/^Approved/).textContent).toBe("Approved39");
        expect(segment(/^Denied/).textContent).toBe("Denied1");
        expect(bodyRows()).toHaveLength(40);
    });

    it("shows the request, run, answer, person, hash and time of a row", async () => {
        const decisions = await sampleDecisions();
        render(<DecisionsTable decisions={decisions} now={NOW} fresh={new Set()} />);
        const first = decisions[0];
        const cells = within(bodyRows()[0]).getAllByRole("cell");
        const link = within(cells[0]).getByRole("link", { name: `Open run ${first.runId}` });
        expect(link.getAttribute("href")).toBe(`/runs/${first.runId}`);
        expect(link.textContent).toBe("pay_invoicebilling");
        expect(cells[0].querySelector("[id]")).toBeNull();
        expect(cells[1].textContent).toBe(first.runId.slice(0, 8));
        expect(cells[2].textContent).toBe("Approved once");
        expect(cells[3].textContent).toBe("priya@acme.com");
        expect(cells[4].textContent).toBe(first.argsHash.slice(0, 12));
        expect(cells[5].textContent).toBe("43 min ago17:57 UTC");
    });

    it("marks an answer given in this session as just now and makes it a link target", async () => {
        const decisions = await sampleDecisions();
        render(<DecisionsTable decisions={decisions} now={NOW} fresh={new Set(["apr_7ff3"])} />);
        const cells = within(bodyRows()[0]).getAllByRole("cell");
        expect(cells[0].querySelector("#apr_7ff3")).toBeTruthy();
        expect(cells[5].textContent).toBe("Just now17:57 UTC");
    });

    it("filters to denied or approved answers", async () => {
        render(<DecisionsTable decisions={await sampleDecisions()} now={NOW} fresh={new Set()} />);
        fireEvent.click(segment(/^Denied/));
        expect(segment(/^Denied/).getAttribute("aria-pressed")).toBe("true");
        const denied = bodyRows();
        expect(denied).toHaveLength(1);
        expect(denied.every((row) => row.textContent?.includes("Denied"))).toBe(true);
        fireEvent.click(segment(/^Approved/));
        const approved = bodyRows();
        expect(approved).toHaveLength(39);
        expect(approved.some((row) => row.textContent?.includes("Always approved"))).toBe(true);
        expect(approved.some((row) => row.textContent?.includes("Denied"))).toBe(false);
    });

    it("says no request was denied and shows all again on request", async () => {
        const approvedOnly = (await sampleDecisions()).filter((item) => item.answer !== "deny");
        render(<DecisionsTable decisions={approvedOnly} now={NOW} fresh={new Set()} />);
        fireEvent.click(segment(/^Denied/));
        expect(screen.getByRole("heading", { name: "No denied requests" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Show all" }));
        expect(segment(/^All/).getAttribute("aria-pressed")).toBe("true");
        expect(bodyRows()).toHaveLength(39);
    });

    it("says no request was approved", async () => {
        const deniedOnly = (await sampleDecisions()).filter((item) => item.answer === "deny");
        render(<DecisionsTable decisions={deniedOnly} now={NOW} fresh={new Set()} />);
        fireEvent.click(segment(/^Approved/));
        expect(screen.getByRole("heading", { name: "No approved requests" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Show all" })).toBeTruthy();
    });

    it("says there are no decisions yet, with nothing to reset", () => {
        render(<DecisionsTable decisions={[]} now={NOW} fresh={new Set()} />);
        expect(screen.getByRole("heading", { name: "No decisions yet" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Show all" })).toBeNull();
    });
});
