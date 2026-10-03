import { SIGNED_IN } from "@/lib/data/session";
import type { Session } from "./session-token";

type Env = Record<string, string | undefined>;

// QUARD_SKIP_SIGN_IN=1 lets every request in as the sample account, for screenshots and local work.
// Production ignores it, so a stray setting can never open a real install.
export function skipsSignIn(env: Env = process.env): boolean {
    return env.QUARD_SKIP_SIGN_IN === "1" && env.NODE_ENV !== "production";
}

// The account the sample data is built around. It never expires.
export const SAMPLE_SESSION: Session = { sub: "sample", email: SIGNED_IN.email, github: null, exp: 4102444800 };
