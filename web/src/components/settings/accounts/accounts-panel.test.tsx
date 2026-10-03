import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSettings } from "@/lib/data/settings";
import { NOW } from "@/lib/data/rng";
import { AccountsPanel } from "./accounts-panel";

const { accounts } = await getSettings();

function cells(text: string): string[] {
    const row = screen.getByText(text).closest("tr") as HTMLElement;
    return within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent ?? "");
}

function liveNote(): string {
    // Hidden too, since an open drawer hides the page from the accessibility tree
    const statuses = screen.getAllByRole("status", { hidden: true });
    const note = statuses.find((node) => node.getAttribute("aria-live") === "polite");
    if (!note) throw new Error("The panel has no live note");
    return note.textContent;
}

async function invite(address: string) {
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: address } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
    await act(async () => {});
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("AccountsPanel", () => {
    it("counts admins and approvers in the table caption", () => {
        render(<AccountsPanel accounts={accounts} me="dana@acme.com" now={NOW} />);
        expect(screen.getByRole("table", { name: "Accounts: 2 admins and 3 approvers" })).toBeTruthy();
        const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
        expect(headers).toEqual(["Person", "Role", "Added", "Last sign-in"]);
    });

    it("marks the signed-in person and shows when each person last signed in", () => {
        render(<AccountsPanel accounts={accounts} me="dana@acme.com" now={NOW} />);
        expect(cells("dana@acme.com")).toEqual(["Dana WhitfieldYoudana@acme.com", "Admin", "29 Jun", "38 min ago"]);
        expect(cells("marco@acme.com")).toEqual(["Marco Bianchimarco@acme.com", "Approver", "24 Jul", "3 h ago"]);
    });

    it("says when someone has never signed in", () => {
        render(<AccountsPanel accounts={accounts} me="dana@acme.com" now={NOW} />);
        expect(cells("sam.okafor@acme.com")[3]).toBe("Never signed in");
    });

    it("shows an empty state when there are no accounts", () => {
        render(<AccountsPanel accounts={[]} me="dana@acme.com" now={NOW} />);
        expect(screen.getByRole("heading", { level: 3, name: "No accounts" })).toBeTruthy();
        expect(screen.getByText("Invite people to answer approvals.")).toBeTruthy();
    });

    it("adds an invited person at the top, reads out the invite and closes the drawer", async () => {
        render(<AccountsPanel accounts={accounts} me="dana@acme.com" now={NOW} />);
        await invite("new.person@acme.com");
        await act(() => vi.advanceTimersByTimeAsync(700));

        const first = screen.getAllByRole("row")[1];
        expect(within(first).getAllByRole("cell")[0].textContent).toBe("new.personnew.person@acme.com");
        expect(cells("new.person@acme.com").slice(1)).toEqual(["Approver", "3 Oct", "Invite sent"]);
        expect(liveNote()).toBe("Invite sent to new.person@acme.com as approver.");
        expect(screen.getByRole("table", { name: "Accounts: 2 admins and 4 approvers" })).toBeTruthy();
        await act(() => vi.advanceTimersByTimeAsync(240));
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("will not invite someone who is already listed", async () => {
        render(<AccountsPanel accounts={accounts} me="dana@acme.com" now={NOW} />);
        await invite("marco@acme.com");
        await act(() => vi.advanceTimersByTimeAsync(700));
        expect(screen.getByText("This person already has an account.")).toBeTruthy();
        // The open drawer hides the page from the accessibility tree
        expect(screen.getAllByRole("row", { hidden: true })).toHaveLength(accounts.length + 1);
        expect(liveNote()).toBe("");
    });
});
