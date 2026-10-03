import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getApprovals } from "@/lib/data/approvals";
import type { AlwaysGrant } from "@/lib/data/approvals";
import { NOW } from "@/lib/data/rng";
import { RevokeCell } from "./revoke-cell";

async function grant(id: string): Promise<AlwaysGrant> {
    const { grants } = await getApprovals();
    return grants.find((entry) => entry.id === id)!;
}

describe("RevokeCell", () => {
    it("asks for a confirm before revoking, then hands the grant back", async () => {
        const active = await grant("grant_e5a2");
        const onRevoke = vi.fn();
        render(<RevokeCell grant={active} now={NOW} onRevoke={onRevoke} />);
        fireEvent.click(screen.getByRole("button", { name: "Revoke grant_e5a2" }));
        const confirm = screen.getByRole("button", { name: "Confirm revoke grant_e5a2" });
        expect(document.activeElement).toBe(confirm);
        expect(onRevoke).not.toHaveBeenCalled();
        fireEvent.click(confirm);
        expect(onRevoke).toHaveBeenCalledWith(active);
    });

    it("keeps the grant and puts focus back on Revoke", async () => {
        const onRevoke = vi.fn();
        render(<RevokeCell grant={await grant("grant_e5a2")} now={NOW} onRevoke={onRevoke} />);
        fireEvent.click(screen.getByRole("button", { name: "Revoke grant_e5a2" }));
        fireEvent.click(screen.getByRole("button", { name: "Keep" }));
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Revoke grant_e5a2" }));
        expect(onRevoke).not.toHaveBeenCalled();
    });

    it("does not grab focus on first render", async () => {
        render(<RevokeCell grant={await grant("grant_e5a2")} now={NOW} onRevoke={vi.fn()} />);
        expect(document.activeElement).toBe(document.body);
    });

    it("shows who revoked a grant and when, with no button", async () => {
        const { container } = render(<RevokeCell grant={await grant("grant_77b2")} now={NOW} onRevoke={vi.fn()} />);
        expect(screen.queryByRole("button")).toBeNull();
        const line = container.firstElementChild;
        expect(line?.textContent).toBe("Revoked 11 d agodana@acme.com");
        expect(line?.getAttribute("title")).toBe("Revoked by dana@acme.com");
    });

    it("says unknown when nobody is recorded as revoking", async () => {
        const revoked = { ...(await grant("grant_77b2")), revokedBy: null };
        const { container } = render(<RevokeCell grant={revoked} now={NOW} onRevoke={vi.fn()} />);
        expect(container.firstElementChild?.getAttribute("title")).toBe("Revoked by unknown");
    });
});
