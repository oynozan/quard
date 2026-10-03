import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ApprovalDecision } from "@/lib/data/approvals";
import { DECISIONS } from "../../../test/approvals/history";
import { NOW } from "../../../test/time";
import { DecisionsTable } from "./decisions-table";

function show(decisions: ApprovalDecision[] = DECISIONS, fresh = new Set<string>()) {
    return render(<DecisionsTable decisions={decisions} now={NOW} fresh={fresh} />);
}

function bodyRows() {
    return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}

const segment = (name: RegExp) => screen.getByRole("button", { name });

describe("DecisionsTable", () => {
    it("lists every past answer and counts each kind", () => {
        show();
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Decided4");
        expect(segment(/^All/).textContent).toBe("All4");
        expect(segment(/^Approved/).textContent).toBe("Approved3");
        expect(segment(/^Denied/).textContent).toBe("Denied1");
        expect(bodyRows()).toHaveLength(4);
    });

    it("shows the request, run, answer, person, hash and time of a row", () => {
        show();
        const first = DECISIONS[0];
        const cells = within(bodyRows()[0]).getAllByRole("cell");
        const link = within(cells[0]).getByRole("link", { name: `Open run ${first.runId}` });
        expect(link.getAttribute("href")).toBe(`/runs/${first.runId}`);
        expect(link.textContent).toBe("pay_invoicebilling");
        expect(cells[0].querySelector("[id]")).toBeNull();
        expect(cells[1].textContent).toBe(first.runId.slice(0, 8));
        expect(cells[2].textContent).toBe("Approved once");
        expect(cells[3].textContent).toBe("priya@example.com");
        expect(cells[4].textContent).toBe(first.argsHash.slice(0, 12));
        expect(cells[5].textContent).toBe("43 min ago17:57 UTC");
    });

    it("marks an answer given in this session as just now and makes it a link target", () => {
        show(DECISIONS, new Set(["apr_7ff3"]));
        const cells = within(bodyRows()[0]).getAllByRole("cell");
        expect(cells[0].querySelector("#apr_7ff3")).toBeTruthy();
        expect(cells[5].textContent).toBe("Just now17:57 UTC");
    });

    it("filters to denied or approved answers", () => {
        show();
        fireEvent.click(segment(/^Denied/));
        expect(segment(/^Denied/).getAttribute("aria-pressed")).toBe("true");
        const denied = bodyRows();
        expect(denied).toHaveLength(1);
        expect(denied[0].textContent).toContain("Denied");
        fireEvent.click(segment(/^Approved/));
        const approved = bodyRows();
        expect(approved).toHaveLength(3);
        expect(approved.some((row) => row.textContent?.includes("Always approved"))).toBe(true);
        expect(approved.some((row) => row.textContent?.includes("Denied"))).toBe(false);
    });

    it("says no request was denied, with no table or count, and shows all again on request", () => {
        show(DECISIONS.filter((item) => item.answer !== "deny"));
        expect(segment(/^Denied/).textContent).toBe("Denied");
        fireEvent.click(segment(/^Denied/));
        expect(screen.getByRole("heading", { name: "No denied requests" })).toBeTruthy();
        expect(screen.queryByRole("table")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Show all" }));
        expect(segment(/^All/).getAttribute("aria-pressed")).toBe("true");
        expect(bodyRows()).toHaveLength(3);
    });

    it("says no request was approved", () => {
        show(DECISIONS.filter((item) => item.answer === "deny"));
        expect(segment(/^Approved/).textContent).toBe("Approved");
        fireEvent.click(segment(/^Approved/));
        expect(screen.getByRole("heading", { name: "No approved requests" })).toBeTruthy();
        expect(screen.queryByRole("table")).toBeNull();
        expect(screen.getByRole("button", { name: "Show all" })).toBeTruthy();
    });

    it("renders nothing before the first answer", () => {
        const { container } = show([]);
        expect(container.innerHTML).toBe("");
    });
});
