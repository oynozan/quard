import type { ingestBatch } from "@quard/db";

// The shared upload types, reached through the db package that web depends on
type UploadItem = Parameters<typeof ingestBatch>[2][number];
type RunStarted = Extract<UploadItem["event"], { type: "run_started" }>;

let uploads = 0;

// A 32-hex run id from a small number
export function runId(n: number): string {
    return n.toString(16).padStart(32, "0");
}

// A run_started upload with the agent and the origin overrides in force when it began
export function runStarted(run: string, agent: string, at: number, origins: RunStarted["origins"]): UploadItem {
    uploads += 1;
    return {
        id: uploads.toString(16).padStart(16, "0"),
        event: { type: "run_started", runId: run, agent, at: new Date(at).toISOString(), origins },
    };
}
