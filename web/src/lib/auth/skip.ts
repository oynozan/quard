import type { Session } from "./session-token";

type Env = Record<string, string | undefined>;

// QUARD_SKIP_SIGN_IN=1 skips sign-in in development, and production ignores it
export function skipsSignIn(env: Env = process.env): boolean {
    return env.QUARD_SKIP_SIGN_IN === "1" && env.NODE_ENV !== "production";
}

// The local account every request uses while sign-in is skipped, which never expires
export const LOCAL_SESSION: Session = { sub: "local", email: "dev@localhost", github: null, exp: 4102444800 };
