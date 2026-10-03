import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SignInError from "./error";

const crash = new Error("Privy failed");

function showAt(url: string) {
    vi.stubGlobal("location", new URL(url));
    return render(<SignInError error={crash} retry={() => undefined} />);
}

describe("SignInError", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("asks for HTTPS when the page is served over plain http on another host", () => {
        showAt("http://quard.example.com/sign-in");
        expect(screen.getByRole("heading", { level: 1, name: "Sign-in could not start" })).toBeTruthy();
        expect(screen.getByText("Open this page over HTTPS, or on localhost.")).toBeTruthy();
    });

    // HTTPS anywhere, and plain http on the local hosts, are fine for Privy
    it.each(["https://quard.example.com/sign-in", "http://localhost:3100/sign-in", "http://127.0.0.1:3100/sign-in"])(
        "asks to wait at %s, where Privy can start",
        (url) => {
            showAt(url);
            expect(screen.getByText("Try again in a minute.")).toBeTruthy();
            expect(screen.queryByText("Open this page over HTTPS, or on localhost.")).toBeNull();
        },
    );

    it("asks to wait while rendered on the server, where there is no window", () => {
        vi.stubGlobal("window", undefined);
        const page = SignInError({ error: crash, retry: () => undefined });
        vi.unstubAllGlobals();
        render(page);
        expect(screen.getByText("Try again in a minute.")).toBeTruthy();
    });

    it("tries again from the button, inside the sign-in card", () => {
        const retry = vi.fn();
        render(<SignInError error={crash} retry={retry} />);
        expect(screen.getByText("Sign in")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(retry).toHaveBeenCalledOnce();
    });
});
