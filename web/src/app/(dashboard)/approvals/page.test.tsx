import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL } from "../../../../test/approvals-overview/fixtures";
import { approvalsData } from "../../../../test/approvals-overview/history";
import { NOW } from "../../../../test/time";
import ApprovalsPage, { metadata } from "./page";

const data = vi.hoisted(() => ({ getApprovals: vi.fn() }));
vi.mock("@/lib/data/approvals/query", () => data);
vi.mock("@/lib/data/scope", () => ({ requestTime: async () => NOW }));
vi.mock("@/lib/auth/session", () => ({
    requireSession: async () => ({ sub: "did:privy:1", email: null, github: "dana-k", exp: 0 }),
}));
const actions = vi.hoisted(() => ({ answerApproval: vi.fn(), revokeAlwaysGrant: vi.fn() }));
vi.mock("@/lib/data/approvals/actions", () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
    data.getApprovals.mockResolvedValue(approvalsData());
});

afterEach(() => {
    vi.useRealTimers();
    router.refresh.mockClear();
    router.replace.mockClear();
    data.getApprovals.mockClear();
});

// The page as Next renders it for an address with these search params
function page(params: Record<string, string> = {}) {
    return ApprovalsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(params) });
}

describe("ApprovalsPage", () => {
    it("titles the tab", () => {
        expect(metadata.title).toBe("Approvals");
    });

    it("keeps every section with its empty state before any request", async () => {
        data.getApprovals.mockResolvedValueOnce({ open: [], more: 0, grants: [], decisions: [] });
        render(await page());
        expect(screen.getByRole("heading", { level: 1, name: "Approvals" })).toBeTruthy();
        const sections = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
        expect(sections).toEqual(["Waiting for an answer0", "Always approve0", "Decided0"]);
        expect(screen.getByRole("heading", { name: "Nothing waits for an answer" })).toBeTruthy();
    });

    it("shows every open request on the board", async () => {
        render(await page());
        expect(data.getApprovals).toHaveBeenCalledWith(100);
        expect(screen.getByRole("heading", { level: 1, name: "Approvals" })).toBeTruthy();
        const waiting = screen.getByRole("heading", { level: 2, name: /^Waiting for an answer/ });
        expect(waiting.textContent).toBe("Waiting for an answer4");
    });

    it("lists as many open requests as the address asks for, and offers the rest", async () => {
        data.getApprovals.mockResolvedValueOnce(approvalsData({ more: 150 }));
        render(await page({ shown: "200" }));
        expect(data.getApprovals).toHaveBeenCalledWith(200);
        fireEvent.click(screen.getByRole("button", { name: "Show 100 more" }));
        expect(router.replace).toHaveBeenCalledWith("/approvals?shown=300", { scroll: false });
    });

    it("signs each answer with the signed-in person's name", async () => {
        actions.answerApproval.mockResolvedValue("decided");
        vi.useFakeTimers();
        render(await page());
        const card = screen.getAllByRole("article").find((node) => node.id === EMAIL)!;
        fireEvent.click(within(card).getByRole("button", { name: "Approve once" }));
        const decided = within(screen.getByRole("region", { name: "Decided" }));
        expect(decided.getAllByRole("row")[1].textContent).toContain("@dana-k");
        await act(async () => {});
    });
});
