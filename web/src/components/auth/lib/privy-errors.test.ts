// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { privyErrorCode, privyProblem } from "./privy-errors";

const failure = (privyErrorCode?: string) => Object.assign(new Error("Privy failed"), { privyErrorCode });

describe("privyProblem", () => {
    beforeEach(() => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    it("says which method is turned off", () => {
        expect(privyProblem(failure("disallowed_login_method"), "GitHub", "x")).toBe(
            "GitHub sign-in is not enabled for this Privy app.",
        );
        expect(privyProblem(failure("disallowed_login_method"), "Email", "x")).toBe(
            "Email sign-in is not enabled for this Privy app.",
        );
    });

    it("names the other common causes", () => {
        expect(privyProblem(failure("too_many_requests"), "Email", "x")).toBe(
            "Too many attempts. Wait a minute, then try again.",
        );
        expect(privyProblem(failure("captcha_failure"), "Email", "x")).toBe("The bot check did not pass. Try again.");
        expect(privyProblem(failure("captcha_timeout"), "Email", "x")).toBe("The bot check took too long. Try again.");
        expect(privyProblem(failure("oauth_user_denied"), "GitHub", "x")).toBe("GitHub sign-in was cancelled.");
        expect(privyProblem(failure("disallowed_plus_email"), "Email", "x")).toBe(
            "Use an email address without a + part.",
        );
        expect(privyProblem(failure("client_request_timeout"), "GitHub", "x")).toBe(
            "Privy took too long to answer. Try again.",
        );
    });

    it("falls back for anything else, and always logs the code", () => {
        expect(privyProblem(failure("unknown_auth_error"), "GitHub", "fallback")).toBe("fallback");
        expect(privyProblem(new Error("plain"), "GitHub", "fallback")).toBe("fallback");
        expect(privyProblem("text", "Email", "fallback")).toBe("fallback");
        expect(console.warn).toHaveBeenCalledWith(
            "[auth] GitHub sign-in failed (unknown_auth_error):",
            expect.any(Error),
        );
        expect(console.warn).toHaveBeenCalledWith("[auth] Email sign-in failed:", "text");
    });
});

describe("privyErrorCode", () => {
    it("reads the code only when there is one", () => {
        expect(privyErrorCode(failure("too_many_requests"))).toBe("too_many_requests");
        expect(privyErrorCode(failure())).toBeNull();
        expect(privyErrorCode(null)).toBeNull();
        expect(privyErrorCode(42)).toBeNull();
    });
});
