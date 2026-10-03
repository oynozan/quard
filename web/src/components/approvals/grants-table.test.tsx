import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AlwaysGrant } from "@/lib/data/approvals";
import { GRANTS, grantById } from "../../../test/approvals/history";
import { NOW } from "../../../test/time";
import { GrantsTable } from "./grants-table";

function show(grants: AlwaysGrant[] = GRANTS, onRevoke = vi.fn()) {
    return render(<GrantsTable grants={grants} now={NOW} onRevoke={onRevoke} />);
}

function bodyRows() {
    return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}

function rowOf(tool: string, argText: string) {
    return bodyRows().find((row) => row.textContent?.includes(tool) && row.textContent.includes(argText))!;
}

const segment = (name: RegExp) => screen.getByRole("button", { name });
const heading = () => screen.getByRole("heading", { level: 2 });
const active = GRANTS.filter((grant) => grant.revokedAt === null);

describe("GrantsTable", () => {
    it("lists the active grants and counts them in the heading", () => {
        show();
        expect(heading().textContent).toBe("Always approve3");
        expect(segment(/^Active/).getAttribute("aria-pressed")).toBe("true");
        expect(segment(/^Active/).textContent).toBe("Active3");
        expect(segment(/^Revoked/).textContent).toBe("Revoked1");
        expect(bodyRows()).toHaveLength(3);
        expect(screen.queryByText("b…@contoso.example", { exact: false })).toBeNull();
    });

    it("shows each grant's arguments, hash, approver and use", () => {
        show();
        const cells = within(rowOf("pay_invoice", "Litware")).getAllByRole("cell");
        expect(cells[0].textContent).toBe("pay_invoicebilling");
        const line = "iban=BE68…7034  amount=2,050.00 EUR  reference=Litware Labs retainer";
        expect(cells[1].textContent).toBe(line);
        expect(cells[1].querySelector("span")?.getAttribute("title")).toBe(line);
        expect(cells[2].textContent).toBe("b5615b94b951");
        expect(cells[2].querySelector("span")?.getAttribute("title")).toBe("b5615b94b951d7d11a71513c7bcb2209");
        expect(cells[3].textContent).toBe("li.wei@example.com3 Oct");
        expect(cells[4].textContent).toBe("0Never");
    });

    it("says how long ago a used grant last ran", () => {
        show();
        const cells = within(rowOf("deploy_service", "docs-site")).getAllByRole("cell");
        expect(cells[4].textContent).toBe("41last 2 h ago");
    });

    it("hands a confirmed revoke to the caller", () => {
        const onRevoke = vi.fn();
        show(GRANTS, onRevoke);
        fireEvent.click(screen.getByRole("button", { name: "Revoke grant_c260" }));
        fireEvent.click(screen.getByRole("button", { name: "Confirm revoke grant_c260" }));
        expect(onRevoke).toHaveBeenCalledWith(grantById("grant_c260"));
    });

    it("switches to the revoked grants", () => {
        show();
        fireEvent.click(segment(/^Revoked/));
        expect(segment(/^Revoked/).getAttribute("aria-pressed")).toBe("true");
        const rows = bodyRows();
        expect(rows).toHaveLength(1);
        expect(rows[0].textContent).toContain("Revoked 11 d ago");
        expect(within(rows[0]).queryByRole("button")).toBeNull();
    });

    it("says nothing is revoked, with no table or count, and offers the way back", () => {
        show(active);
        expect(segment(/^Revoked/).textContent).toBe("Revoked");
        fireEvent.click(segment(/^Revoked/));
        expect(screen.getByRole("heading", { name: "Nothing revoked" })).toBeTruthy();
        expect(screen.queryByRole("table")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Show active grants" }));
        expect(segment(/^Active/).getAttribute("aria-pressed")).toBe("true");
        expect(bodyRows()).toHaveLength(3);
        expect(screen.queryByRole("heading", { name: "Nothing revoked" })).toBeNull();
    });

    it("says no grant stands, with no table or count, once every grant is revoked", () => {
        show([grantById("grant_77b2")]);
        expect(heading().textContent).toBe("Always approve");
        expect(segment(/^Active/).textContent).toBe("Active");
        expect(screen.getByRole("heading", { name: "No standing grants" })).toBeTruthy();
        expect(screen.queryByRole("table")).toBeNull();
        expect(screen.queryByRole("button", { name: "Show active grants" })).toBeNull();
    });

    it("renders nothing without grants", () => {
        const { container } = show([]);
        expect(container.innerHTML).toBe("");
    });
});
