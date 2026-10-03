import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NOW } from "../../../test/time";
import { ROLLBACK, grants } from "../../../test/approvals-overview/history";
import { GrantsTable } from "./grants-table";

function bodyRows() {
    return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}

function rowOf(tool: string, agentArg: string) {
    return bodyRows().find((row) => row.textContent?.includes(tool) && row.textContent.includes(agentArg))!;
}

const segment = (name: RegExp) => screen.getByRole("button", { name });

describe("GrantsTable", () => {
    it("lists the active grants and counts them in the heading", () => {
        render(<GrantsTable grants={grants()} now={NOW} onRevoke={vi.fn()} />);
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Always approve4");
        expect(segment(/^Active/).getAttribute("aria-pressed")).toBe("true");
        expect(segment(/^Active/).textContent).toBe("Active4");
        expect(segment(/^Revoked/).textContent).toBe("Revoked1");
        expect(bodyRows()).toHaveLength(4);
        expect(screen.queryByText("CF-77164", { exact: false })).toBeNull();
    });

    it("shows each grant's arguments, hash, approver and use", () => {
        render(<GrantsTable grants={grants()} now={NOW} onRevoke={vi.fn()} />);
        const cells = within(rowOf("pay_invoice", "Litware")).getAllByRole("cell");
        expect(cells[0].textContent).toBe("pay_invoicebilling");
        const line = "iban=BE68…7034  amount=2,050.00 EUR  reference=Litware Labs retainer";
        expect(cells[1].textContent).toBe(line);
        expect(cells[1].querySelector("span")?.getAttribute("title")).toBe(line);
        expect(cells[2].textContent).toBe("b5615b94b951");
        expect(cells[2].querySelector("span")?.getAttribute("title")).toBe("b5615b94b951d7d11a71513c7bcb2209");
        expect(cells[3].textContent).toBe("li.wei@acme.com3 Oct");
        expect(cells[4].textContent).toBe("0Never");
    });

    it("says how long ago a used grant last ran", () => {
        render(<GrantsTable grants={grants()} now={NOW} onRevoke={vi.fn()} />);
        const cells = within(rowOf("deploy_service", "docs-site")).getAllByRole("cell");
        expect(cells[4].textContent).toBe("41last 2 h ago");
    });

    it("hands a confirmed revoke to the caller", () => {
        const list = grants();
        const onRevoke = vi.fn();
        render(<GrantsTable grants={list} now={NOW} onRevoke={onRevoke} />);
        fireEvent.click(screen.getByRole("button", { name: `Revoke ${ROLLBACK}` }));
        fireEvent.click(screen.getByRole("button", { name: `Confirm revoke ${ROLLBACK}` }));
        expect(onRevoke).toHaveBeenCalledWith(list.find((grant) => grant.id === ROLLBACK));
    });

    it("switches to the revoked grants", () => {
        render(<GrantsTable grants={grants()} now={NOW} onRevoke={vi.fn()} />);
        fireEvent.click(segment(/^Revoked/));
        expect(segment(/^Revoked/).getAttribute("aria-pressed")).toBe("true");
        const rows = bodyRows();
        expect(rows).toHaveLength(1);
        expect(rows[0].textContent).toContain("Revoked 11 d ago");
        expect(within(rows[0]).queryByRole("button")).toBeNull();
    });

    it("says nothing is revoked and offers the way back", () => {
        const active = grants().filter((grant) => grant.revokedAt === null);
        render(<GrantsTable grants={active} now={NOW} onRevoke={vi.fn()} />);
        fireEvent.click(segment(/^Revoked/));
        expect(screen.getByRole("heading", { name: "Nothing revoked" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Show active grants" }));
        expect(segment(/^Active/).getAttribute("aria-pressed")).toBe("true");
        expect(bodyRows()).toHaveLength(4);
        expect(screen.queryByRole("heading", { name: "Nothing revoked" })).toBeNull();
    });

    it("says there are no standing grants", () => {
        render(<GrantsTable grants={[]} now={NOW} onRevoke={vi.fn()} />);
        expect(screen.getByRole("heading", { name: "No standing grants" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Show active grants" })).toBeNull();
        expect(bodyRows()).toHaveLength(0);
    });
});
