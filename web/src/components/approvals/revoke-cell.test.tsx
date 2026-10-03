import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { grantById } from "../../../test/approvals/history";
import { NOW } from "../../../test/time";
import { RevokeCell } from "./revoke-cell";

describe("RevokeCell", () => {
    it("asks for a confirm before revoking, then hands the grant back", () => {
        const active = grantById("grant_e5a2");
        const onRevoke = vi.fn();
        render(<RevokeCell grant={active} now={NOW} onRevoke={onRevoke} />);
        fireEvent.click(screen.getByRole("button", { name: "Revoke grant_e5a2" }));
        const confirm = screen.getByRole("button", { name: "Confirm revoke grant_e5a2" });
        expect(document.activeElement).toBe(confirm);
        expect(onRevoke).not.toHaveBeenCalled();
        fireEvent.click(confirm);
        expect(onRevoke).toHaveBeenCalledWith(active);
    });

    it("keeps the grant and puts focus back on Revoke", () => {
        const onRevoke = vi.fn();
        render(<RevokeCell grant={grantById("grant_e5a2")} now={NOW} onRevoke={onRevoke} />);
        fireEvent.click(screen.getByRole("button", { name: "Revoke grant_e5a2" }));
        fireEvent.click(screen.getByRole("button", { name: "Keep" }));
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Revoke grant_e5a2" }));
        expect(onRevoke).not.toHaveBeenCalled();
    });

    it("does not grab focus on first render", () => {
        render(<RevokeCell grant={grantById("grant_e5a2")} now={NOW} onRevoke={vi.fn()} />);
        expect(document.activeElement).toBe(document.body);
    });

    it("shows who revoked a grant and when, with no button", () => {
        const { container } = render(<RevokeCell grant={grantById("grant_77b2")} now={NOW} onRevoke={vi.fn()} />);
        expect(screen.queryByRole("button")).toBeNull();
        const line = container.firstElementChild;
        expect(line?.textContent).toBe("Revoked 11 d agokim@example.com");
        expect(line?.getAttribute("title")).toBe("Revoked by kim@example.com");
    });

    it("says unknown when nobody is recorded as revoking", () => {
        const revoked = { ...grantById("grant_77b2"), revokedBy: null };
        const { container } = render(<RevokeCell grant={revoked} now={NOW} onRevoke={vi.fn()} />);
        expect(container.firstElementChild?.getAttribute("title")).toBe("Revoked by unknown");
    });
});
