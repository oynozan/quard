// Privy errors carry a code; the common ones get a sentence that says what actually went wrong.

type Method = "GitHub" | "Email";

const BY_CODE: Record<string, (method: Method) => string> = {
    disallowed_login_method: (method) => `${method} sign-in is not enabled for this Privy app.`,
    too_many_requests: () => "Too many attempts. Wait a minute, then try again.",
    captcha_failure: () => "The bot check did not pass. Try again.",
    captcha_timeout: () => "The bot check took too long. Try again.",
    oauth_user_denied: () => "GitHub sign-in was cancelled.",
    disallowed_plus_email: () => "Use an email address without a + part.",
    client_request_timeout: () => "Privy took too long to answer. Try again.",
};

export function privyErrorCode(error: unknown): string | null {
    if (typeof error !== "object" || error === null) return null;
    const code = (error as { privyErrorCode?: unknown }).privyErrorCode;
    return typeof code === "string" ? code : null;
}

// The sentence to show for a failed Privy call; the full error goes to the console for whoever runs Quard.
export function privyProblem(error: unknown, method: Method, fallback: string): string {
    const code = privyErrorCode(error);
    console.warn(`[auth] ${method} sign-in failed${code ? ` (${code})` : ""}:`, error);
    const message = code ? BY_CODE[code] : undefined;
    return message ? message(method) : fallback;
}
