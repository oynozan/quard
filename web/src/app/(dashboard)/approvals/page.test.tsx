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
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
    data.getApprovals.mockResolvedValue(approvalsData());
});

afterEach(() => {
    vi.useRealTimers();
    router.refresh.mockClear();
});

describe("ApprovalsPage", () => {
    it("titles the tab", () => {
        expect(metadata.title).toBe("Approvals");
    });

    it("keeps every section with its empty state before any request", async () => {
        data.getApprovals.mockResolvedValueOnce({ open: [], grants: [], decisions: [] });
        render(await ApprovalsPage());
        expect(screen.getByRole("heading", { level: 1, name: "Approvals" })).toBeTruthy();
        const sections = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
        expect(sections).toEqual(["Waiting for an answer0", "Always approve0", "Decided0"]);
        expect(screen.getByRole("heading", { name: "Nothing waits for an answer" })).toBeTruthy();
    });

    it("shows every open request on the board", async () => {
        render(await ApprovalsPage());
        expect(screen.getByRole("heading", { level: 1, name: "Approvals" })).toBeTruthy();
        const waiting = screen.getByRole("heading", { level: 2, name: /^Waiting for an answer/ });
        expect(waiting.textContent).toBe("Waiting for an answer4");
    });

    it("signs each answer with the signed-in person's name", async () => {
        actions.answerApproval.mockResolvedValue("decided");
        vi.useFakeTimers();
        render(await ApprovalsPage());
        const card = screen.getAllByRole("article").find((node) => node.id === EMAIL)!;
        fireEvent.click(within(card).getByRole("button", { name: "Approve once" }));
        const decided = within(screen.getByRole("region", { name: "Decided" }));
        expect(decided.getAllByRole("row")[1].textContent).toContain("@dana-k");
        await act(async () => {});
    });
});
