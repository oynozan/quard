import type { Db } from "@quard/db";
import type { Fetch, OpenAiConfig } from "../openai/call.ts";

// What a job needs to run
export type JobDeps = {
    db: Db;
    // Unset without OPENAI_API_KEY
    openai: OpenAiConfig | undefined;
    // Tests pass a fake Responses API
    fetch?: Fetch;
};

export function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
