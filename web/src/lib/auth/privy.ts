import { InvalidAuthTokenError, PrivyClient } from "@privy-io/node";
import { identityOf, type Identity } from "./access";
import type { AuthEnv } from "./env";

let cached: { key: string; client: PrivyClient } | null = null;

function client(env: AuthEnv): PrivyClient {
    const key = `${env.appId}:${env.appSecret}:${env.verificationKey ?? ""}`;
    if (cached?.key !== key) {
        const options = { appId: env.appId, appSecret: env.appSecret };
        const privy = new PrivyClient(
            env.verificationKey ? { ...options, jwtVerificationKey: env.verificationKey } : options,
        );
        cached = { key, client: privy };
    }
    return cached.client;
}

export type PrivyLogin = Identity & { sub: string };

// Checks a Privy access token. Null means the token is not valid; setup and network failures throw.
export async function verifyPrivyLogin(accessToken: string, env: AuthEnv): Promise<PrivyLogin | null> {
    const privy = client(env);
    let userId: string;
    try {
        userId = (await privy.utils().auth().verifyAccessToken(accessToken)).user_id;
    } catch (error) {
        // Logged so a wrong app id or verification key shows up on the server, not just as failed sign-ins.
        console.warn("[auth] Privy token check failed:", error instanceof Error ? error.message : error);
        if (error instanceof InvalidAuthTokenError) return null;
        throw error;
    }
    const user = await privy.users()._get(userId);
    return { sub: userId, ...identityOf(user.linked_accounts) };
}
