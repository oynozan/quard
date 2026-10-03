import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth/session-token";
import { getApprovals } from "@/lib/data/approvals/query";
import { expectNoChartsOrTables } from "../../../../test/empty";
import { approvalsData } from "../../../../test/approvals/history";
import { NOW } from "../../../../test/time";
import ApprovalsPage, { metadata } from "./page";

// A GitHub-only account, shown as @jo-k
const SESSION = vi.hoisted((): Session => ({ sub: "did:privy:1", email: null, github: "jo-k", exp: 4102444800 }));
vi.mock("@/lib/auth/session", () => ({ requireSession: async () => SESSION }));
vi.mock("@/lib/data/scope", () => ({ requestTime: async () => NOW }));
vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("@/lib/data/approvals/query", async (importOriginal) => {
    const real = await importOriginal<typeof import("@/lib/data/approvals/query")>();
    return { ...real, getApprovals: vi.fn(real.getApprovals) };
});

async function showPage() {
    return render(await ApprovalsPage());
}

describe("ApprovalsPage", () => {
    it("titles the tab", () => {
        expect(metadata.title).toBe("Approvals");
    });

    it("shows only the heading and one line before any request", async () => {
        const { container } = await showPage();
        expect(screen.getByRole("heading", { level: 1, name: "Approvals" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("No approval requests yet");
        expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
        expectNoChartsOrTables(container);
    });

    it("shows the requests, grants and answers on the board", async () => {
        vi.mocked(getApprovals).mockResolvedValueOnce(approvalsData());
        await showPage();
        const sections = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
        expect(sections).toEqual(["Waiting for an answer4", "Always approve3", "Decided4"]);
        expect(screen.getByRole("article", { name: "send_email" }).textContent).toContain("Waiting 9 min");
    });

    it("signs a revoke with the signed-in person's name", async () => {
        vi.mocked(getApprovals).mockResolvedValueOnce(approvalsData());
        await showPage();
        fireEvent.click(screen.getByRole("button", { name: "Revoke grant_c260" }));
        fireEvent.click(screen.getByRole("button", { name: "Confirm revoke grant_c260" }));
        const grants = within(screen.getByRole("region", { name: "Always approve grants" }));
        fireEvent.click(grants.getByRole("button", { name: /^Revoked/ }));
        const row = grants.getAllByRole("row").find((node) => node.textContent?.includes("rollback_service"))!;
        expect(row.textContent).toContain("Revoked 1 min ago@jo-k");
    });
});
