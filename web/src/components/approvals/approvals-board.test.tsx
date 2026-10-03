import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalsData } from "@/lib/data/approvals";
import { NOW } from "../../../test/time";
import { CONTOSO, DEPLOY, EMAIL, PAY, openRequest } from "../../../test/approvals-overview/fixtures";
import { ROLLBACK, approvalsData } from "../../../test/approvals-overview/history";
import { ApprovalsBoard } from "./approvals-board";
import { decisionOf } from "./lib/model";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const actions = vi.hoisted(() => ({ answerApproval: vi.fn(), revokeAlwaysGrant: vi.fn() }));
vi.mock("@/lib/data/approvals/actions", () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const ME = "dana@acme.com";
let frames: FrameRequestCallback[] = [];
// React keeps async transitions entangled, so no server call may stay pending into the next test
const unsettled: (() => void)[] = [];

beforeEach(() => {
    frames = [];
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubGlobal("requestAnimationFrame", (tick: FrameRequestCallback) => frames.push(tick));
    window.history.replaceState(null, "", "/approvals");
});

afterEach(async () => {
    await act(async () => unsettled.splice(0).forEach((settle) => settle()));
    vi.useRealTimers();
    vi.unstubAllGlobals();
    toast.mockClear();
    router.refresh.mockClear();
    actions.answerApproval.mockReset();
    actions.revokeAlwaysGrant.mockReset();
});

// A server call the test settles by hand, or that settles with `last` after the test
function later<T>(last: T) {
    let settle!: (value: T) => void;
    const promise = new Promise<T>((resolve) => {
        settle = resolve;
    });
    unsettled.push(() => settle(last));
    return { promise, settle };
}

// Lets the server call settle and React finish the transition it started
async function flush() {
    await act(async () => {});
    await act(async () => {});
}

function show(data: ApprovalsData = approvalsData()) {
    return render(<ApprovalsBoard data={data} now={NOW} approver={ME} />);
}

// Clicks an answer on a card, then runs the focus frame
function answer(id: string, name: string) {
    fireEvent.click(within(card(id)).getByRole("button", { name }));
    act(() => frames.splice(0).forEach((tick) => tick(0)));
}

function revoke(id: string) {
    fireEvent.click(screen.getByRole("button", { name: `Revoke ${id}` }));
    fireEvent.click(screen.getByRole("button", { name: `Confirm revoke ${id}` }));
}

const cards = () => screen.queryAllByRole("article").map((node) => node.id);
const card = (id: string) => screen.getAllByRole("article").find((node) => node.id === id)!;
const status = () => screen.getAllByRole("status").find((node) => node.getAttribute("aria-live") === "polite")!;
const region = (name: string) => within(screen.getByRole("region", { name }));
const heading = (name: string) => region(name).getByRole("heading", { level: 2 }).textContent;
const told = (message: string, id: string) => expect(toast).toHaveBeenCalledWith(message, { id });

describe("ApprovalsBoard", () => {
    it("puts live requests first, the longest wait on top", () => {
        show();
        expect(cards()).toEqual([EMAIL, PAY, CONTOSO, DEPLOY]);
        expect(heading("Waiting for an answer")).toBe("Waiting for an answer4");
    });

    it("approves once: the card leaves at once, and the server's answer confirms it", async () => {
        const saving = later("decided");
        actions.answerApproval.mockReturnValue(saving.promise);
        const view = show();
        answer(EMAIL, "Approve once");
        expect(actions.answerApproval).toHaveBeenCalledWith(EMAIL, "once");
        expect(cards()).toEqual([PAY, CONTOSO, DEPLOY]);
        expect(document.activeElement?.id).toBe(PAY);
        const row = region("Decided").getAllByRole("row")[1];
        expect(row.textContent).toContain("Approved once");
        expect(row.textContent).toContain(ME);
        expect(row.textContent).toContain("Just now");
        expect(row.querySelector(`#${EMAIL}`)).toBeTruthy();
        expect(heading("Decided")).toBe("Decided6");
        expect(heading("Always approve grants")).toBe("Always approve4");
        expect(toast).not.toHaveBeenCalled();

        // The action's response brings the page without the request
        const data = approvalsData();
        const saved = decisionOf(openRequest(EMAIL), "approve once", NOW, ME);
        const after = { ...data, open: data.open.filter((item) => item.request.id !== EMAIL) };
        view.rerender(
            <ApprovalsBoard data={{ ...after, decisions: [saved, ...data.decisions] }} now={NOW} approver={ME} />,
        );
        await act(async () => saving.settle("decided"));
        told("Approved send_email once", "approval-answer");
        expect(status().textContent).toBe("Approved send_email once. 3 still open.");
        expect(cards()).toEqual([PAY, CONTOSO, DEPLOY]);
        expect(heading("Decided")).toBe("Decided6");
        expect(router.refresh).not.toHaveBeenCalled();
    });

    it("brings the request back when the answer could not be saved", async () => {
        actions.answerApproval.mockRejectedValue(new Error("offline"));
        show();
        answer(EMAIL, "Approve once");
        await flush();
        expect(cards()).toEqual([EMAIL, PAY, CONTOSO, DEPLOY]);
        told("Could not save the answer for send_email. It is still open", "approval-answer");
        expect(status().textContent).toBe("Could not save the answer for send_email. It is still open");
        expect(heading("Decided")).toBe("Decided5");
    });

    it("says when someone else answered first, and reloads the page", async () => {
        actions.answerApproval.mockResolvedValue("already_decided");
        show();
        answer(EMAIL, "Approve once");
        await flush();
        told("Someone already answered send_email", "approval-answer");
        expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it("says when the request is gone, and reloads the page", async () => {
        actions.answerApproval.mockResolvedValue("not_found");
        show();
        answer(EMAIL, "Approve once");
        await flush();
        told("send_email is no longer open", "approval-answer");
        expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it("moves focus to the new last card when the bottom card is answered", () => {
        actions.answerApproval.mockReturnValue(later("decided").promise);
        show();
        answer(DEPLOY, "Approve once");
        expect(document.activeElement?.id).toBe(CONTOSO);
    });

    it("always approve also shows an unused standing grant", async () => {
        actions.answerApproval.mockResolvedValue("decided");
        show();
        answer(EMAIL, "Always approve");
        expect(actions.answerApproval).toHaveBeenCalledWith(EMAIL, "always");
        expect(heading("Always approve grants")).toBe("Always approve5");
        const row = region("Always approve grants").getAllByRole("row")[1];
        expect(row.textContent).toContain("send_emailsupport");
        expect(row.textContent).toContain("0Never");
        await flush();
        told("Always approved send_email for these exact arguments", "approval-answer");
    });

    it("denies after the confirm and records a denial", async () => {
        actions.answerApproval.mockResolvedValue("decided");
        show();
        fireEvent.click(within(card(DEPLOY)).getByRole("button", { name: "Deny" }));
        answer(DEPLOY, "Deny call");
        expect(actions.answerApproval).toHaveBeenCalledWith(DEPLOY, "deny");
        expect(region("Decided").getAllByRole("row")[1].textContent).toContain("Denied");
        await flush();
        expect(status().textContent).toBe("Denied deploy_service. The call returns a refusal. 3 still open.");
    });

    it("shows the empty state and focuses the heading when the last request is answered", () => {
        actions.answerApproval.mockReturnValue(later("decided").promise);
        const { container } = show(approvalsData({ open: [openRequest(PAY)] }));
        answer(PAY, "Approve once");
        expect(cards()).toHaveLength(0);
        expect(screen.getByRole("heading", { level: 2, name: /^Waiting for an answer/ }).textContent).toBe(
            "Waiting for an answer0",
        );
        expect(screen.getByRole("heading", { name: "Nothing waits for an answer" })).toBeTruthy();
        expect(screen.getByText("Calls a guard sends to a human pause here.")).toBeTruthy();
        const top = container.querySelector("section[aria-label='Waiting for an answer'] > div");
        expect(document.activeElement).toBe(top);
    });

    it("clears the address hash when the linked request is answered", () => {
        actions.answerApproval.mockReturnValue(later("decided").promise);
        window.history.replaceState(null, "", `/approvals#${PAY}`);
        show();
        answer(PAY, "Approve once");
        expect(window.location.hash).toBe("");
        expect(window.location.pathname).toBe("/approvals");
    });

    it("keeps the address hash when it points at another request", () => {
        actions.answerApproval.mockReturnValue(later("decided").promise);
        window.history.replaceState(null, "", `/approvals#${EMAIL}`);
        show();
        answer(PAY, "Approve once");
        expect(window.location.hash).toBe(`#${EMAIL}`);
    });

    it("revokes a grant: it moves to revoked at once, signed by the approver", async () => {
        const saving = later(true);
        actions.revokeAlwaysGrant.mockReturnValue(saving.promise);
        show();
        revoke(ROLLBACK);
        expect(actions.revokeAlwaysGrant).toHaveBeenCalledWith(ROLLBACK);
        expect(heading("Always approve grants")).toBe("Always approve3");
        expect(screen.queryByRole("button", { name: `Revoke ${ROLLBACK}` })).toBeNull();
        fireEvent.click(region("Always approve grants").getByRole("button", { name: /^Revoked/ }));
        const rows = region("Always approve grants").getAllByRole("row");
        const row = rows.find((node) => node.textContent?.includes("rollback_service"))!;
        expect(row.textContent).toContain(`Revoked 1 min ago${ME}`);
        await act(async () => saving.settle(true));
        told("Revoked always approve for rollback_service. Later calls ask again", "grant-revoke");
        expect(status().textContent).toBe("Revoked always approve for rollback_service. Later calls ask again");
    });

    it("says when a grant was already revoked, and reloads the page", async () => {
        actions.revokeAlwaysGrant.mockResolvedValue(false);
        show();
        revoke(ROLLBACK);
        await flush();
        told("Always approve for rollback_service was already revoked", "grant-revoke");
        expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it("keeps the grant active when the revoke could not be saved", async () => {
        actions.revokeAlwaysGrant.mockRejectedValue(new Error("offline"));
        show();
        revoke(ROLLBACK);
        await flush();
        told("Could not revoke always approve for rollback_service", "grant-revoke");
        expect(heading("Always approve grants")).toBe("Always approve4");
        expect(screen.getByRole("button", { name: `Revoke ${ROLLBACK}` })).toBeTruthy();
    });
});
