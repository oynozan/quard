// Notices when a sign-in just finished but the browser came back without the session cookie.

const MARK = "quard_signed_in_at";
const WINDOW_MS = 15_000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function store(): Store | undefined {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
}

export function noteSignIn(storage: Store | undefined = store(), now = Date.now()): void {
    try {
        storage?.setItem(MARK, String(now));
    } catch {
        // Storage can be blocked; the note is only a hint.
    }
}

export function clearSignInNote(storage: Store | undefined = store()): void {
    try {
        storage?.removeItem(MARK);
    } catch {
        // Same as above.
    }
}

// True when a sign-in finished moments ago, yet the visitor is back on the sign-in page.
export function cookieWasDropped(storage: Store | undefined = store(), now = Date.now()): boolean {
    try {
        const at = Number(storage?.getItem(MARK));
        return at > 0 && now - at < WINDOW_MS;
    } catch {
        return false;
    }
}
