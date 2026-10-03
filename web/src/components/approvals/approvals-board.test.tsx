import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalsData } from "@/lib/data/approvals";
import { approvalsData } from "../../../test/approvals/history";
import { expectNoChartsOrTables } from "../../../test/empty";
import { NOW } from "../../../test/time";
import { ApprovalsBoard } from "./approvals-board";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const BY = "jo@example.com";

let frames: FrameRequestCallback[] = [];

beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (tick: FrameRequestCallback) => frames.push(tick));
    window.history.replaceState(null, "", "/approvals");
});

afterEach(() => {
    vi.unstubAllGlobals();
    toast.mockClear();
});

function show(data: ApprovalsData = approvalsData()) {
    return render(<ApprovalsBoard data={data} now={NOW} by={BY} />);
}

// Clicks an answer on a card, then runs the focus frame
function answer(card: HTMLElement, name: string) {
    fireEvent.click(within(card).getByRole("button", { name }));
    act(() => frames.splice(0).forEach((tick) => tick(0)));
}

const cards = () => screen.queryAllByRole("article");
const card = (tool: string) => screen.getByRole("article", { name: tool });
const status = () => screen.getAllByRole("status").find((node) => node.getAttribute("aria-live") === "polite")!;
const region = (name: string) => within(screen.getByRole("region", { name }));

function onlyOpen(id: string): ApprovalsData {
    const data = approvalsData();
    return { ...data, open: data.open.filter((item) => item.request.id === id) };
}

describe("ApprovalsBoard", () => {
    it("puts live requests first, the longest wait on top", () => {
        show();
        expect(cards().map((node) => node.id)).toEqual(["apr_7f2c", "apr_7f31", "apr_7f0a", "apr_7f1e"]);
        const heading = screen.getByRole("heading", { level: 2, name: /^Waiting for an answer/ });
        expect(heading.textContent).toBe("Waiting for an answer4");
    });

    it("approves once: the card leaves, a decision is added and focus moves to the next card", () => {
        show();
        answer(card("send_email"), "Approve once");
        expect(cards().map((node) => node.id)).toEqual(["apr_7f31", "apr_7f0a", "apr_7f1e"]);
        expect(toast).toHaveBeenCalledWith("Approved send_email once", { id: "approval-answer" });
        expect(status().textContent).toBe("Approved send_email once. 3 still open.");
        expect(document.activeElement?.id).toBe("apr_7f31");
        const decided = region("Decided");
        expect(decided.getByRole("heading", { level: 2 }).textContent).toBe("Decided5");
        const row = decided.getAllByRole("row")[1];
        expect(row.textContent).toContain("Approved once");
        expect(row.textContent).toContain(BY);
        expect(row.textContent).toContain("Just now");
        expect(row.querySelector("#apr_7f2c")).toBeTruthy();
        expect(region("Always approve grants").getByRole("heading", { level: 2 }).textContent).toBe("Always approve3");
    });

    it("moves focus to the new last card when the bottom card is answered", () => {
        show();
        answer(card("deploy_service"), "Approve once");
        expect(document.activeElement?.id).toBe("apr_7f0a");
    });

    it("always approve also adds an unused standing grant", () => {
        show();
        answer(card("send_email"), "Always approve");
        expect(toast).toHaveBeenCalledWith("Always approved send_email for these exact arguments", {
            id: "approval-answer",
        });
        const grants = region("Always approve grants");
        expect(grants.getByRole("heading", { level: 2 }).textContent).toBe("Always approve4");
        const row = grants.getAllByRole("row")[1];
        expect(row.textContent).toContain("send_emailsupport");
        expect(row.textContent).toContain(`${BY}3 Oct`);
        expect(row.textContent).toContain("0Never");
        expect(grants.getByRole("button", { name: "Revoke grant_5b81" })).toBeTruthy();
    });

    it("denies after the confirm and records a denial", () => {
        show();
        const target = card("deploy_service");
        fireEvent.click(within(target).getByRole("button", { name: "Deny" }));
        answer(target, "Deny call");
        expect(status().textContent).toBe("Denied deploy_service. The call returns a refusal. 3 still open.");
        expect(region("Decided").getAllByRole("row")[1].textContent).toContain("Denied");
    });

    it("says nothing waits and focuses the heading when the last request is answered", () => {
        const { container } = show(onlyOpen("apr_7f31"));
        answer(card("pay_invoice"), "Approve once");
        expect(cards()).toHaveLength(0);
        const waiting = region("Waiting for an answer");
        expect(waiting.getByRole("heading", { level: 2 }).textContent).toBe("Waiting for an answer");
        expect(waiting.getByRole("status").textContent).toBe("Nothing waits for an answer");
        expect(status().textContent).toBe("Approved pay_invoice once. 0 still open.");
        const heading = container.querySelector("section[aria-label='Waiting for an answer'] > div");
        expect(document.activeElement).toBe(heading);
    });

    it("clears the address hash when the linked request is answered", () => {
        window.history.replaceState(null, "", "/approvals#apr_7f31");
        show(onlyOpen("apr_7f31"));
        answer(card("pay_invoice"), "Approve once");
        expect(window.location.hash).toBe("");
        expect(window.location.pathname).toBe("/approvals");
    });

    it("keeps the address hash when it points at another request", () => {
        window.history.replaceState(null, "", "/approvals#apr_7f2c");
        show(onlyOpen("apr_7f31"));
        answer(card("pay_invoice"), "Approve once");
        expect(window.location.hash).toBe("#apr_7f2c");
    });

    it("revokes a grant: it moves to revoked, signed by the person who revoked it", () => {
        show();
        fireEvent.click(screen.getByRole("button", { name: "Revoke grant_c260" }));
        fireEvent.click(screen.getByRole("button", { name: "Confirm revoke grant_c260" }));
        expect(toast).toHaveBeenCalledWith("Revoked always approve for rollback_service. Later calls ask again", {
            id: "grant-revoke",
        });
        expect(status().textContent).toBe("Revoked always approve for rollback_service. Later calls ask again");
        const grants = region("Always approve grants");
        expect(grants.getByRole("heading", { level: 2 }).textContent).toBe("Always approve2");
        expect(grants.queryByRole("button", { name: "Revoke grant_c260" })).toBeNull();
        fireEvent.click(grants.getByRole("button", { name: /^Revoked/ }));
        const row = grants.getAllByRole("row").find((node) => node.textContent?.includes("rollback_service"))!;
        expect(row.textContent).toContain(`Revoked 1 min ago${BY}`);
    });

    it("shows only the waiting requests when nothing was granted or decided yet", () => {
        show({ ...approvalsData(), grants: [], decisions: [] });
        expect(cards()).toHaveLength(4);
        expect(screen.queryByRole("region", { name: "Always approve grants" })).toBeNull();
        expect(screen.queryByRole("region", { name: "Decided" })).toBeNull();
    });

    it("says nothing waits, with no count, when only grants and answers exist", () => {
        show({ ...approvalsData(), open: [] });
        const waiting = region("Waiting for an answer");
        expect(waiting.getByRole("heading", { level: 2 }).textContent).toBe("Waiting for an answer");
        expect(waiting.getByRole("status").textContent).toBe("Nothing waits for an answer");
        expectNoChartsOrTables(screen.getByRole("region", { name: "Waiting for an answer" }));
        expect(cards()).toHaveLength(0);
        expect(screen.getByRole("region", { name: "Decided" })).toBeTruthy();
    });
});
