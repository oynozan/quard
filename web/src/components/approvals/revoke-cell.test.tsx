import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AlwaysGrant } from "@/lib/data/approvals";
import { NOW } from "../../../test/time";
import { LITWARE, REVOKED, grants } from "../../../test/approvals-overview/history";
import { RevokeCell } from "./revoke-cell";

function grant(id: string): AlwaysGrant {
    return grants().find((entry) => entry.id === id)!;
}

describe("RevokeCell", () => {
    it("asks for a confirm before revoking, then hands the grant back", () => {
        const active = grant(LITWARE);
        const onRevoke = vi.fn();
        render(<RevokeCell grant={active} now={NOW} onRevoke={onRevoke} />);
        fireEvent.click(screen.getByRole("button", { name: `Revoke ${LITWARE}` }));
        const confirm = screen.getByRole("button", { name: `Confirm revoke ${LITWARE}` });
        expect(document.activeElement).toBe(confirm);
        expect(onRevoke).not.toHaveBeenCalled();
        fireEvent.click(confirm);
        expect(onRevoke).toHaveBeenCalledWith(active);
    });

    it("keeps the grant and puts focus back on Revoke", () => {
        const onRevoke = vi.fn();
        render(<RevokeCell grant={grant(LITWARE)} now={NOW} onRevoke={onRevoke} />);
        fireEvent.click(screen.getByRole("button", { name: `Revoke ${LITWARE}` }));
        fireEvent.click(screen.getByRole("button", { name: "Keep" }));
        expect(document.activeElement).toBe(screen.getByRole("button", { name: `Revoke ${LITWARE}` }));
        expect(onRevoke).not.toHaveBeenCalled();
    });

    it("does not grab focus on first render", () => {
        render(<RevokeCell grant={grant(LITWARE)} now={NOW} onRevoke={vi.fn()} />);
        expect(document.activeElement).toBe(document.body);
    });

    it("shows who revoked a grant and when, with no button", () => {
        const { container } = render(<RevokeCell grant={grant(REVOKED)} now={NOW} onRevoke={vi.fn()} />);
        expect(screen.queryByRole("button")).toBeNull();
        const line = container.firstElementChild;
        expect(line?.textContent).toBe("Revoked 11 d agodana@acme.com");
        expect(line?.getAttribute("title")).toBe("Revoked by dana@acme.com");
    });

    it("says unknown when nobody is recorded as revoking", () => {
        const revoked = { ...grant(REVOKED), revokedBy: null };
        const { container } = render(<RevokeCell grant={revoked} now={NOW} onRevoke={vi.fn()} />);
        expect(container.firstElementChild?.getAttribute("title")).toBe("Revoked by unknown");
    });
});
