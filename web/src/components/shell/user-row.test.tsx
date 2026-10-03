import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { cookieWasDropped, noteSignIn } from "@/components/auth/lib/sign-in-mark";
import { stopPageLoads } from "../../../test/fleet-shell/shell";
import { UserRow } from "./user-row";

const assign = vi.fn();
const fetcher = vi.fn();
// A fixed sign-in time, so the note reads the same on every run
const SIGNED_IN_AT = Date.UTC(2026, 9, 1);

function signOutButton() {
    return screen.getByRole("button", { name: "Sign out" });
}

function show() {
    render(
        <>
            <UserRow title="dana@acme.com" sub="Admin" />
            <Toaster />
        </>,
    );
}

beforeEach(() => {
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("location", { origin: window.location.origin, assign });
    noteSignIn(window.sessionStorage, SIGNED_IN_AT);
});

afterEach(() => {
    vi.unstubAllGlobals();
    assign.mockReset();
    fetcher.mockReset();
    window.sessionStorage.clear();
});

describe("UserRow", () => {
    it("shows who is signed in and links the row to settings", () => {
        show();
        const link = screen.getByRole("link");
        expect(link.getAttribute("href")).toBe("/settings");
        expect(link.querySelector("strong")?.textContent).toBe("dana@acme.com");
        expect(link.querySelector("small")?.textContent).toBe("Admin");
        expect(signOutButton().hasAttribute("disabled")).toBe(false);
    });

    it("tells the caller when the settings row is followed", () => {
        const onNavigate = vi.fn();
        const restoreLoads = stopPageLoads();
        render(<UserRow title="dana@acme.com" sub="Admin" onNavigate={onNavigate} />);
        fireEvent.click(screen.getByRole("link"));
        restoreLoads();
        expect(onNavigate).toHaveBeenCalledTimes(1);
        expect(fetcher).not.toHaveBeenCalled();
    });

    it("ends the session, forgets the sign-in note and loads the sign-in page", async () => {
        let finish: (response: { ok: boolean }) => void = () => {};
        fetcher.mockReturnValue(new Promise((resolve) => (finish = resolve)));
        show();
        fireEvent.click(signOutButton());
        expect(signOutButton().hasAttribute("disabled")).toBe(true);
        expect(fetcher).toHaveBeenCalledWith("/api/auth/session", { method: "DELETE" });

        await act(async () => finish({ ok: true }));
        expect(cookieWasDropped(window.sessionStorage, SIGNED_IN_AT)).toBe(false);
        expect(assign).toHaveBeenCalledTimes(1);
        expect(String(assign.mock.calls[0][0])).toBe(`${window.location.origin}/sign-in?signed_out=1`);
    });

    it("stays signed in and says so when the server does not confirm", async () => {
        fetcher.mockResolvedValue({ ok: false });
        show();
        await act(async () => fireEvent.click(signOutButton()));
        await act(async () => {});
        expect(signOutButton().hasAttribute("disabled")).toBe(false);
        expect(await screen.findByText("Sign-out failed. Try again.")).toBeTruthy();
        expect(cookieWasDropped(window.sessionStorage, SIGNED_IN_AT)).toBe(true);
        expect(assign).not.toHaveBeenCalled();
    });
});
