import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { privy, privyModule, resetPrivy } from "../../../../test/auth-app/privy";
import SignInPage, { metadata } from "./page";

vi.mock("@privy-io/react-auth", () => privyModule);

const APP_ID = "cm0000000000000000000000a";

async function showPage(params: Record<string, string | string[]> = {}) {
    render(await SignInPage({ params: Promise.resolve({}), searchParams: Promise.resolve(params) }));
}

function setUp() {
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", APP_ID);
    vi.stubEnv("PRIVY_APP_SECRET", "secret");
    vi.stubEnv("QUARD_SESSION_SECRET", "s".repeat(40));
}

describe("SignInPage", () => {
    beforeEach(() => {
        resetPrivy();
        vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "");
        vi.stubEnv("PRIVY_APP_SECRET", "");
        vi.stubEnv("QUARD_SESSION_SECRET", "");
        vi.stubEnv("NODE_ENV", "development");
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("titles the tab", () => {
        expect(metadata.title).toBe("Sign in");
    });

    it("starts Privy with the app id once sign-in is set up", async () => {
        setUp();
        await showPage();
        expect(privy.provider.mock.calls[0]![0].appId).toBe(APP_ID);
        expect(screen.getByRole("heading", { level: 1, name: "Sign in to Quard" })).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe("");
    });

    it("confirms a sign-out from the address", async () => {
        setUp();
        await showPage({ signed_out: "1" });
        expect(screen.getByRole("status").textContent).toBe("You are signed out.");
    });

    it("keeps a page on this site to return to after GitHub", async () => {
        setUp();
        await showPage({ next: "/runs?agent=billing" });
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue with GitHub" })));
        expect(new URLSearchParams(window.location.search).get("next")).toBe("/runs?agent=billing");
    });

    it("returns to the overview instead of a link to another site", async () => {
        setUp();
        window.history.replaceState(null, "", "/sign-in?next=x");
        await showPage({ next: "//evil.example" });
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue with GitHub" })));
        expect(window.location.search).toBe("");
    });

    it("returns to the overview when the address gives more than one page", async () => {
        setUp();
        window.history.replaceState(null, "", "/sign-in?next=x");
        await showPage({ next: ["/runs", "/agents"] });
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue with GitHub" })));
        expect(window.location.search).toBe("");
    });

    it("lists what to fix during development", async () => {
        await showPage();
        expect(screen.getByRole("heading", { level: 1, name: "Sign-in is not set up" })).toBeTruthy();
        expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
            "NEXT_PUBLIC_PRIVY_APP_ID is not set",
            "PRIVY_APP_SECRET is not set",
            "QUARD_SESSION_SECRET is not set",
        ]);
        expect(console.error).not.toHaveBeenCalled();
    });

    it("keeps the details for the server log in production", async () => {
        vi.stubEnv("NODE_ENV", "production");
        await showPage();
        expect(screen.getByRole("heading", { level: 1, name: "Sign-in is not available" })).toBeTruthy();
        expect(screen.queryByRole("list")).toBeNull();
        expect(console.error).toHaveBeenCalledWith(
            "[auth] Sign-in is not set up:",
            "NEXT_PUBLIC_PRIVY_APP_ID is not set; PRIVY_APP_SECRET is not set; QUARD_SESSION_SECRET is not set",
        );
    });

    it("logs nothing in production once sign-in is set up", async () => {
        setUp();
        vi.stubEnv("NODE_ENV", "production");
        await showPage();
        expect(console.error).not.toHaveBeenCalled();
    });
});
