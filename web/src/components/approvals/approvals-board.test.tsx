import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getApprovals } from "@/lib/data/approvals";
import type { ApprovalsData } from "@/lib/data/approvals";
import { NOW } from "@/lib/data/rng";
import { ApprovalsBoard } from "./approvals-board";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

let frames: FrameRequestCallback[] = [];

beforeEach(() => {
    frames = [];
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (tick: FrameRequestCallback) => frames.push(tick));
    window.history.replaceState(null, "", "/approvals");
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    toast.mockClear();
});

// Clicks an answer on a card, waits out the busy state, then runs the focus frame
function answer(card: HTMLElement, name: string) {
    fireEvent.click(within(card).getByRole("button", { name }));
    act(() => vi.advanceTimersByTime(450));
    act(() => frames.splice(0).forEach((tick) => tick(0)));
}

const cards = () => screen.queryAllByRole("article");
const card = (tool: string) => screen.getByRole("article", { name: tool });
const status = () => screen.getAllByRole("status").find((node) => node.getAttribute("aria-live") === "polite")!;

async function onlyOpen(id: string): Promise<ApprovalsData> {
    const data = await getApprovals();
    return { ...data, open: data.open.filter((item) => item.request.id === id) };
}

describe("ApprovalsBoard", () => {
    it("puts live requests first, the longest wait on top", async () => {
        render(<ApprovalsBoard data={await getApprovals()} now={NOW} />);
        expect(cards().map((node) => node.id)).toEqual(["apr_7f2c", "apr_7f31", "apr_7f0a", "apr_7f1e"]);
        const heading = screen.getByRole("heading", { level: 2, name: /^Waiting for an answer/ });
        expect(heading.textContent).toBe("Waiting for an answer4");
    });

    it("approves once: the card leaves, a decision is added and focus moves to the next card", async () => {
        render(<ApprovalsBoard data={await getApprovals()} now={NOW} />);
        answer(card("send_email"), "Approve once");
        expect(cards().map((node) => node.id)).toEqual(["apr_7f31", "apr_7f0a", "apr_7f1e"]);
        expect(toast).toHaveBeenCalledWith("Approved send_email once", { id: "approval-answer" });
        expect(status().textContent).toBe("Approved send_email once. 3 still open.");
        expect(document.activeElement?.id).toBe("apr_7f31");
        const decided = within(screen.getByRole("region", { name: "Decided" }));
        expect(decided.getByRole("heading", { level: 2 }).textContent).toBe("Decided41");
        const row = decided.getAllByRole("row")[1];
        expect(row.textContent).toContain("Approved once");
        expect(row.textContent).toContain("dana@acme.com");
        expect(row.textContent).toContain("Just now");
        expect(row.querySelector("#apr_7f2c")).toBeTruthy();
        const grants = within(screen.getByRole("region", { name: "Always approve grants" }));
        expect(grants.getByRole("heading", { level: 2 }).textContent).toBe("Always approve5");
    });

    it("moves focus to the new last card when the bottom card is answered", async () => {
        render(<ApprovalsBoard data={await getApprovals()} now={NOW} />);
        answer(card("deploy_service"), "Approve once");
        expect(document.activeElement?.id).toBe("apr_7f0a");
    });

    it("always approve also adds an unused standing grant", async () => {
        const data = await getApprovals();
        const hash = data.open.find((item) => item.request.id === "apr_7f2c")!.argsHash;
        render(<ApprovalsBoard data={data} now={NOW} />);
        answer(card("send_email"), "Always approve");
        expect(toast).toHaveBeenCalledWith("Always approved send_email for these exact arguments", {
            id: "approval-answer",
        });
        const grants = within(screen.getByRole("region", { name: "Always approve grants" }));
        expect(grants.getByRole("heading", { level: 2 }).textContent).toBe("Always approve6");
        const row = grants.getAllByRole("row")[1];
        expect(row.textContent).toContain("send_emailsupport");
        expect(row.textContent).toContain("0Never");
        expect(grants.getByRole("button", { name: `Revoke grant_${hash.slice(0, 4)}` })).toBeTruthy();
    });

    it("denies after the confirm and records a denial", async () => {
        render(<ApprovalsBoard data={await getApprovals()} now={NOW} />);
        const target = card("deploy_service");
        fireEvent.click(within(target).getByRole("button", { name: "Deny" }));
        answer(target, "Deny call");
        expect(status().textContent).toBe("Denied deploy_service. The call returns a refusal. 3 still open.");
        const decided = within(screen.getByRole("region", { name: "Decided" }));
        expect(decided.getAllByRole("row")[1].textContent).toContain("Denied");
    });

    it("shows the empty state and focuses the heading when the last request is answered", async () => {
        const { container } = render(<ApprovalsBoard data={await onlyOpen("apr_7f31")} now={NOW} />);
        answer(card("pay_invoice"), "Approve once");
        expect(cards()).toHaveLength(0);
        expect(screen.getByRole("heading", { name: "Nothing waits for an answer" })).toBeTruthy();
        expect(screen.getByText("Calls a guard sends to a human pause here.")).toBeTruthy();
        expect(status().textContent).toBe("Approved pay_invoice once. 0 still open.");
        const heading = container.querySelector("section[aria-label='Waiting for an answer'] > div");
        expect(document.activeElement).toBe(heading);
    });

    it("clears the address hash when the linked request is answered", async () => {
        window.history.replaceState(null, "", "/approvals#apr_7f31");
        render(<ApprovalsBoard data={await onlyOpen("apr_7f31")} now={NOW} />);
        answer(card("pay_invoice"), "Approve once");
        expect(window.location.hash).toBe("");
        expect(window.location.pathname).toBe("/approvals");
    });

    it("keeps the address hash when it points at another request", async () => {
        window.history.replaceState(null, "", "/approvals#apr_7f2c");
        render(<ApprovalsBoard data={await onlyOpen("apr_7f31")} now={NOW} />);
        answer(card("pay_invoice"), "Approve once");
        expect(window.location.hash).toBe("#apr_7f2c");
    });

    it("revokes a grant: it moves to revoked, signed by the current user", async () => {
        render(<ApprovalsBoard data={await getApprovals()} now={NOW} />);
        fireEvent.click(screen.getByRole("button", { name: "Revoke grant_c260" }));
        fireEvent.click(screen.getByRole("button", { name: "Confirm revoke grant_c260" }));
        expect(toast).toHaveBeenCalledWith("Revoked always approve for rollback_service. Later calls ask again", {
            id: "grant-revoke",
        });
        expect(status().textContent).toBe("Revoked always approve for rollback_service. Later calls ask again");
        const grants = within(screen.getByRole("region", { name: "Always approve grants" }));
        expect(grants.getByRole("heading", { level: 2 }).textContent).toBe("Always approve4");
        expect(grants.queryByRole("button", { name: "Revoke grant_c260" })).toBeNull();
        fireEvent.click(grants.getByRole("button", { name: /^Revoked/ }));
        const row = grants.getAllByRole("row").find((node) => node.textContent?.includes("rollback_service"))!;
        expect(row.textContent).toContain("Revoked 1 min agodana@acme.com");
    });
});
