// Sign-in settings. Only the Privy app id ever reaches the browser.
export type AuthEnv = {
    appId: string;
    appSecret: string;
    verificationKey: string | null;
    sessionSecret: string;
    production: boolean;
};

type Env = Record<string, string | undefined>;

// What is missing or malformed, one line each, so the sign-in page can say exactly what to fix.
export function setupProblems(env: Env = process.env): string[] {
    const appId = env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
    const sessionSecret = env.QUARD_SESSION_SECRET?.trim();
    const problems: string[] = [];
    if (!appId) problems.push("NEXT_PUBLIC_PRIVY_APP_ID is not set");
    // Privy app ids are always 25 characters; Privy refuses to start with anything else.
    else if (!/^[a-z0-9]{25}$/i.test(appId)) problems.push("NEXT_PUBLIC_PRIVY_APP_ID must be 25 letters or digits");
    if (!env.PRIVY_APP_SECRET?.trim()) problems.push("PRIVY_APP_SECRET is not set");
    if (!sessionSecret) problems.push("QUARD_SESSION_SECRET is not set");
    else if (sessionSecret.length < 32) problems.push("QUARD_SESSION_SECRET must be at least 32 characters");
    return problems;
}

// Null until every setting is valid, so sign-in stays closed rather than half open.
export function readAuthEnv(env: Env = process.env): AuthEnv | null {
    if (setupProblems(env).length > 0) return null;
    return {
        appId: env.NEXT_PUBLIC_PRIVY_APP_ID!.trim(),
        appSecret: env.PRIVY_APP_SECRET!.trim(),
        verificationKey: env.PRIVY_VERIFICATION_KEY?.trim() || null,
        sessionSecret: env.QUARD_SESSION_SECRET!.trim(),
        production: env.NODE_ENV === "production",
    };
}
