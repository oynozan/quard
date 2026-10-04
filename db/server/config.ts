import { createRedactor, parseHashKey, readPort, type Redactor } from "@quard/shared";

export type ServerConfig = { port: number; databaseUrl: string; redactor: Redactor };

// The settings a service needs, or a message saying what is wrong
export function readServerConfig(env: Record<string, string | undefined>, defaultPort: number): ServerConfig | string {
    if (!env.DATABASE_URL) {
        return "DATABASE_URL is not set";
    }
    if (!env.QUARD_HASH_KEY) {
        return "QUARD_HASH_KEY is not set: 64 hex characters, the same in every agent process";
    }
    try {
        const redactor = createRedactor(parseHashKey(env.QUARD_HASH_KEY));
        return { port: readPort(env.PORT, defaultPort), databaseUrl: env.DATABASE_URL, redactor };
    } catch (error) {
        return `QUARD_HASH_KEY is not valid: ${(error as Error).message}`;
    }
}
