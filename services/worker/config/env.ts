import type { OpenAiConfig } from "../openai/call.ts";

export type WorkerConfig = {
    databaseUrl: string;
    // Unset without OPENAI_API_KEY: the reviewer and the label fallback are
    // skipped, and replay can't run
    openai: OpenAiConfig | undefined;
};

const OPENAI_BASE_URL = "https://api.openai.com/v1";

// The settings the worker needs, or a message saying what is wrong
export function readConfig(env: Record<string, string | undefined>): WorkerConfig | string {
    if (!env.DATABASE_URL) {
        return "DATABASE_URL is not set";
    }
    const baseUrl = (env.OPENAI_BASE_URL || OPENAI_BASE_URL).replace(/\/+$/, "");
    const openai = env.OPENAI_API_KEY ? { apiKey: env.OPENAI_API_KEY, baseUrl } : undefined;
    return { databaseUrl: env.DATABASE_URL, openai };
}
