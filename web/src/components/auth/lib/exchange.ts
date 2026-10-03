// Talks to our own session endpoint: a Privy token in, a Quard session cookie out.

export type ExchangeResult = { ok: true } | { ok: false; message: string };

const MESSAGES: Record<number, string> = {
    401: "That sign-in could not be verified. Try again.",
    502: "Privy could not be reached. Try again.",
    503: "Sign-in is not available right now. Try again in a minute.",
};
const METHOD_REFUSED = "Sign in with email or GitHub.";

export async function exchangeToken(
    accessToken: string | null,
    fetcher: typeof fetch = fetch,
): Promise<ExchangeResult> {
    if (!accessToken) return { ok: false, message: "Sign-in did not finish. Try again." };
    let response: Response;
    try {
        response = await fetcher("/api/auth/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ accessToken }),
        });
    } catch {
        return { ok: false, message: "The server could not be reached. Try again." };
    }
    if (response.ok) return { ok: true };
    if (response.status === 403) {
        // Only the login-method refusal is meant for people; anything else stays generic.
        const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
        return { ok: false, message: body?.error === METHOD_REFUSED ? METHOD_REFUSED : MESSAGES[401] };
    }
    return { ok: false, message: MESSAGES[response.status] ?? "Sign-in failed. Try again." };
}

// Clears the session cookie; false when the server did not confirm it.
export async function endSession(fetcher: typeof fetch = fetch): Promise<boolean> {
    try {
        return (await fetcher("/api/auth/session", { method: "DELETE" })).ok;
    } catch {
        return false;
    }
}
