import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { holdFrames, runFrames } from "../../../test/auth-app/frames";
import { completeLogin, privy, privyModule, resetPrivy, setPrivy } from "../../../test/auth-app/privy";
import { SignInPanel } from "./sign-in-panel";

vi.mock("@privy-io/react-auth", () => privyModule);

const MARK = "quard_signed_in_at";
const wrongCode = { privyErrorCode: "invalid_credentials" };

function show(props: { next?: string; signedOut?: boolean } = {}) {
    return render(<SignInPanel next={props.next ?? "/"} signedOut={props.signedOut ?? false} />);
}

const status = () => screen.getByRole("status").textContent;
const alert = () => screen.queryByRole("alert")?.textContent ?? null;
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const emailInput = () => screen.getByLabelText("Email") as HTMLInputElement;
const codeInput = () => screen.getByLabelText(/^Code sent to/) as HTMLInputElement;

async function askForCode(address = "dana@acme.com") {
    fireEvent.change(emailInput(), { target: { value: address } });
    await act(async () => {
        fireEvent.click(button("Email me a code"));
    });
}

async function enterCode(code: string) {
    fireEvent.change(codeInput(), { target: { value: code } });
    await act(async () => {
        fireEvent.click(button("Sign in"));
    });
}

function answer(statusCode: number) {
    const fetcher = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
        async () => new Response(null, { status: statusCode }),
    );
    vi.stubGlobal("fetch", fetcher);
    return fetcher;
}

beforeEach(() => {
    resetPrivy();
    holdFrames();
    sessionStorage.clear();
    window.history.replaceState(null, "", "/sign-in?signed_out=1");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("SignInPanel while Privy starts", () => {
    it("shows a loading line and locks every button until Privy is ready", () => {
        setPrivy({ ready: false });
        show();
        expect(status()).toBe("Loading sign-in…");
        expect(button("Continue with GitHub").disabled).toBe(true);
        expect(button("Email me a code").disabled).toBe(true);
        setPrivy({ ready: true });
        expect(status()).toBe("");
        expect(button("Email me a code").disabled).toBe(false);
    });

    it("says sign-in is unavailable when Privy is still not ready after eight seconds", () => {
        vi.useFakeTimers();
        setPrivy({ ready: false });
        show();
        act(() => vi.advanceTimersByTime(7999));
        expect(alert()).toBeNull();
        act(() => vi.advanceTimersByTime(1));
        expect(alert()).toBe("Sign-in is not available right now. Try again in a minute.");
        expect(status()).toBe("");
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("NEXT_PUBLIC_PRIVY_APP_ID"));
    });

    it("never warns when Privy gets ready in time", () => {
        vi.useFakeTimers();
        setPrivy({ ready: false });
        show();
        act(() => vi.advanceTimersByTime(3000));
        setPrivy({ ready: true });
        act(() => vi.advanceTimersByTime(10000));
        expect(alert()).toBeNull();
        expect(console.warn).not.toHaveBeenCalled();
    });
});

describe("SignInPanel notes on arrival", () => {
    it("confirms a sign-out", () => {
        sessionStorage.setItem(MARK, String(Date.now()));
        show({ signedOut: true });
        expect(status()).toBe("You are signed out.");
        expect(alert()).toBeNull();
    });

    it("asks to allow cookies when a sign-in just finished but the cookie is missing", () => {
        sessionStorage.setItem(MARK, String(Date.now()));
        show();
        expect(alert()).toBe("Your browser did not keep the sign-in. Allow cookies for this site, then try again.");
    });
});

describe("SignInPanel email step", () => {
    it("refuses an address that is not an email and focuses the field", async () => {
        show();
        await askForCode("dana");
        expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
        expect(document.activeElement).toBe(emailInput());
        expect(privy.sendCode).not.toHaveBeenCalled();
        fireEvent.change(emailInput(), { target: { value: "dana@" } });
        expect(screen.queryByText("Enter a valid email address.")).toBeNull();
        fireEvent.change(emailInput(), { target: { value: "dana@a" } });
        expect(emailInput().value).toBe("dana@a");
    });

    it("sends a code to the trimmed address and moves to the code step", async () => {
        show();
        await askForCode("  dana@acme.com ");
        expect(privy.sendCode).toHaveBeenCalledWith({ email: "dana@acme.com" });
        expect(status()).toBe("Code sent to dana@acme.com.");
        runFrames();
        expect(document.activeElement).toBe(codeInput());
        expect(screen.getByText("Code sent to dana@acme.com")).toBeTruthy();
    });

    it("explains why a code could not be sent", async () => {
        privy.sendCode.mockRejectedValue({ privyErrorCode: "disallowed_plus_email" });
        show();
        await askForCode("dana+1@acme.com");
        expect(alert()).toBe("Use an email address without a + part.");
        expect(screen.queryByLabelText(/^Code sent to/)).toBeNull();
    });

    it("keeps the address read-only while the code is on its way", () => {
        show();
        setPrivy({ emailStatus: "sending-code" });
        expect(emailInput().readOnly).toBe(true);
        expect(button("Sending code…").getAttribute("aria-busy")).toBe("true");
    });
});

describe("SignInPanel code step", () => {
    it("keeps only six digits and waits for all of them", async () => {
        show();
        await askForCode();
        fireEvent.change(codeInput(), { target: { value: "12a34-5678" } });
        expect(codeInput().value).toBe("123456");
        fireEvent.change(codeInput(), { target: { value: "123" } });
        expect(button("Sign in").disabled).toBe(true);
        await act(async () => {
            fireEvent.submit(codeInput().form!);
        });
        expect(privy.loginWithCode).not.toHaveBeenCalled();
    });

    it("sends the code to Privy", async () => {
        show();
        await askForCode();
        await enterCode("123456");
        expect(privy.loginWithCode).toHaveBeenCalledWith({ code: "123456" });
        expect(alert()).toBeNull();
    });

    it("counts wrong codes and asks for a new one after five", async () => {
        privy.loginWithCode.mockRejectedValue(wrongCode);
        show();
        await askForCode();
        await enterCode("111111");
        expect(alert()).toBe("That code did not work. Check it or send a new one.");
        expect(codeInput().value).toBe("");
        runFrames();
        expect(document.activeElement).toBe(codeInput());
        privy.loginWithCode.mockRejectedValue(new Error("no code on this one"));
        for (let i = 0; i < 4; i++) await enterCode("111111");
        expect(alert()).toBe("Too many tries. Send a new code.");
        expect(codeInput().disabled).toBe(true);
        expect(button("Sign in").disabled).toBe(true);
    });

    it("explains a Privy failure that is not a wrong code, without counting it", async () => {
        privy.loginWithCode.mockRejectedValue({ privyErrorCode: "captcha_failure" });
        show();
        await askForCode();
        await enterCode("123456");
        expect(alert()).toBe("The bot check did not pass. Try again.");
        expect(codeInput().value).toBe("123456");
    });

    it("sends a new code and starts the count again", async () => {
        privy.loginWithCode.mockRejectedValue(wrongCode);
        show();
        await askForCode();
        for (let i = 0; i < 5; i++) await enterCode("111111");
        await act(async () => {
            fireEvent.click(button("Send a new code"));
        });
        expect(privy.sendCode).toHaveBeenCalledTimes(2);
        expect(status()).toBe("New code sent to dana@acme.com.");
        expect(alert()).toBeNull();
        expect(codeInput().disabled).toBe(false);
    });

    it("locks the code while Privy checks it, and shows a new code on its way", async () => {
        show();
        await askForCode();
        setPrivy({ emailStatus: "submitting-code" });
        expect(codeInput().readOnly).toBe(true);
        expect(button("Checking code…").getAttribute("aria-busy")).toBe("true");
        expect(button("Use another email").disabled).toBe(true);
        setPrivy({ emailStatus: "sending-code" });
        expect(button("Sending…").disabled).toBe(true);
    });

    it("goes back to the email step and focuses the address", async () => {
        show();
        await askForCode();
        fireEvent.click(button("Use another email"));
        expect(status()).toBe("");
        expect(emailInput().value).toBe("dana@acme.com");
        runFrames();
        expect(document.activeElement).toBe(emailInput());
    });
});

describe("SignInPanel finishing a sign-in", () => {
    function stubLocation() {
        const replace = vi.fn();
        vi.stubGlobal("location", { pathname: "/sign-in", replace });
        return replace;
    }

    it("trades the Privy token for a session, ends the Privy session and opens the next page", async () => {
        const fetcher = answer(200);
        const replace = stubLocation();
        show({ next: "/runs" });
        await completeLogin("email", { wasAlreadyAuthenticated: false });
        expect(fetcher).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({ method: "POST" }));
        expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({ accessToken: "privy-token" });
        expect(privy.logout).toHaveBeenCalledOnce();
        expect(status()).toBe("Opening Quard…");
        expect(replace).toHaveBeenCalledWith("/runs");
        expect(Number(sessionStorage.getItem(MARK))).toBeGreaterThan(0);
        expect(screen.queryByRole("button", { name: "Continue with GitHub" })).toBeNull();
    });

    it("shows a spinner and hides the buttons while the server answers", async () => {
        let reply: (response: Response) => void = () => undefined;
        vi.stubGlobal("fetch", () => new Promise<Response>((resolve) => (reply = resolve)));
        show();
        await completeLogin("github", { wasAlreadyAuthenticated: false });
        expect(status()).toBe("Signing in…");
        expect(screen.getByRole("status").querySelector(".spinner")).toBeTruthy();
        expect(screen.queryByLabelText("Email")).toBeNull();
        await completeLogin("email", { wasAlreadyAuthenticated: false });
        await completeLogin("email", { wasAlreadyAuthenticated: true });
        await act(async () => reply(new Response(null, { status: 503 })));
        expect(privy.getAccessToken).toHaveBeenCalledOnce();
        expect(alert()).toBe("Sign-in is not available right now. Try again in a minute.");
    });

    it("starts over at the email step when the server refuses the sign-in", async () => {
        answer(401);
        show();
        await askForCode();
        await completeLogin("email", { wasAlreadyAuthenticated: false });
        expect(alert()).toBe("That sign-in could not be verified. Try again.");
        expect(status()).toBe("");
        runFrames();
        expect(document.activeElement).toBe(emailInput());
        expect(button("Continue with GitHub").disabled).toBe(false);
    });

    it("says sign-in did not finish when Privy gives no token, even if its logout fails", async () => {
        const fetcher = answer(200);
        privy.getAccessToken.mockRejectedValue(new Error("expired"));
        privy.logout.mockRejectedValue(new Error("offline"));
        show();
        await completeLogin("email", { wasAlreadyAuthenticated: false });
        expect(fetcher).not.toHaveBeenCalled();
        expect(alert()).toBe("Sign-in did not finish. Try again.");
    });
});

describe("SignInPanel with a Privy session left from before", () => {
    it("ends the old session first and stays on the page", async () => {
        let done: () => void = () => undefined;
        privy.logout.mockReturnValue(new Promise<void>((resolve) => (done = resolve)));
        show();
        await completeLogin("email", { wasAlreadyAuthenticated: true });
        expect(status()).toBe("Getting sign-in ready…");
        expect(button("Email me a code").disabled).toBe(true);
        await completeLogin("github", { wasAlreadyAuthenticated: true });
        await completeLogin("github", { wasAlreadyAuthenticated: false });
        expect(privy.logout).toHaveBeenCalledOnce();
        expect(privy.getAccessToken).not.toHaveBeenCalled();
        await act(async () => done());
        expect(status()).toBe("");
        expect(button("Email me a code").disabled).toBe(false);
    });

    it("unlocks the page even when ending the old session fails", async () => {
        privy.logout.mockRejectedValue(new Error("offline"));
        show();
        await completeLogin("github", { wasAlreadyAuthenticated: true });
        expect(status()).toBe("");
        expect(button("Continue with GitHub").disabled).toBe(false);
    });
});

describe("SignInPanel GitHub button", () => {
    async function continueWithGitHub() {
        await act(async () => {
            fireEvent.click(button("Continue with GitHub"));
        });
    }

    it("drops the signed-out note from the address before leaving for GitHub", async () => {
        show({ signedOut: true });
        await continueWithGitHub();
        expect(window.location.pathname).toBe("/sign-in");
        expect(window.location.search).toBe("");
        expect(privy.initOAuth).toHaveBeenCalledWith({ provider: "github" });
    });

    it("keeps the page to return to in the address", async () => {
        show({ next: "/runs?agent=billing" });
        await continueWithGitHub();
        expect(new URLSearchParams(window.location.search).get("next")).toBe("/runs?agent=billing");
    });

    it("explains why GitHub sign-in could not start", async () => {
        privy.initOAuth.mockRejectedValue({ privyErrorCode: "disallowed_login_method" });
        show();
        await continueWithGitHub();
        expect(alert()).toBe("GitHub sign-in is not enabled for this Privy app.");
    });

    it("names the step while GitHub opens and locks the email form", () => {
        show();
        setPrivy({ oauthLoading: true });
        const opening = button("Opening GitHub…");
        expect(opening.getAttribute("aria-busy")).toBe("true");
        expect(opening.querySelector("svg")).toBeNull();
        expect(button("Email me a code").disabled).toBe(true);
    });

    it("says GitHub sign-in did not finish, unless a newer problem is showing", async () => {
        privy.sendCode.mockRejectedValue(new Error("network"));
        show();
        setPrivy({ oauthStatus: "error" });
        expect(alert()).toBe("GitHub sign-in did not finish. Try again.");
        await askForCode();
        expect(alert()).toBe("The code could not be sent. Check the address and try again.");
    });
});
