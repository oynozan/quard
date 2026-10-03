import { createRedactor, parseHashKey, readPort, type Redactor } from "@quard/shared";

export type WebhookConfig = { port: number; databaseUrl: string; redactor: Redactor };

// The settings webhook needs, or a message saying what is wrong
export function readConfig(env: Record<string, string | undefined>): WebhookConfig | string {
    if (!env.DATABASE_URL) {
        return "DATABASE_URL is not set";
    }
    if (!env.QUARD_HASH_KEY) {
        return "QUARD_HASH_KEY is not set: 64 hex characters, the same in every agent process";
    }
    try {
        const redactor = createRedactor(parseHashKey(env.QUARD_HASH_KEY));
        return { port: readPort(env.PORT, 4100), databaseUrl: env.DATABASE_URL, redactor };
    } catch (error) {
        return `QUARD_HASH_KEY is not valid: ${(error as Error).message}`;
    }
}
