import { canEnter } from "./access";
import type { AuthEnv } from "./env";
import { verifySession, type Session } from "./session-token";

// A cookie value becomes a session only if it is signed, unexpired and names an email or GitHub account.
export async function sessionFromToken(
    token: string | undefined,
    env: AuthEnv | null,
    now = Date.now(),
): Promise<Session | null> {
    if (!env || !token) return null;
    const session = await verifySession(token, env.sessionSecret, now);
    return session && canEnter(session) ? session : null;
}
