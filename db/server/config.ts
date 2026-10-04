import { parseHashKey, readPort } from "@quard/shared";
import { projectKeys, type ProjectKeys } from "./project-keys.ts";

export type ServerConfig = {
    port: number;
    databaseUrl: string;
    // QUARD_HASH_KEY, which never leaves the server
    installKey: Buffer;
    keys: ProjectKeys;
};

// The settings a service needs, or a message saying what is wrong
export function readServerConfig(env: Record<string, string | undefined>, defaultPort: number): ServerConfig | string {
    if (!env.DATABASE_URL) {
        return "DATABASE_URL is not set";
    }
    if (!env.QUARD_HASH_KEY) {
        return (
            "QUARD_HASH_KEY is not set: 64 hex characters, the same for webhook, control and the dashboard. " +
            "Agents never need it."
        );
    }
    try {
        const installKey = parseHashKey(env.QUARD_HASH_KEY);
        const port = readPort(env.PORT, defaultPort);
        return { port, databaseUrl: env.DATABASE_URL, installKey, keys: projectKeys(installKey) };
    } catch (error) {
        return `QUARD_HASH_KEY is not valid: ${(error as Error).message}`;
    }
}
