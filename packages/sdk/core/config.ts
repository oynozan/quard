import type { OriginOverrides, RunEvent } from "@quard/shared";
import type { ArgumentLabel } from "../labels/value-labels.ts";

export type ApprovalAnswer = "once" | "always" | "deny";

export type ApprovalRequest = {
    runId: string;
    agent: string;
    stepId: string;
    tool: string;
    input: unknown;
    values: ArgumentLabel[];
};

export type QuardConfig = {
    origins: OriginOverrides;
    onEvent?: (event: RunEvent) => void;
    // Asks a human. The dashboard takes this over in M3.
    approver?: (request: ApprovalRequest) => Promise<ApprovalAnswer>;
    // Uploads to webhook start once all three are set
    key?: string;
    webhookUrl?: string;
    // The install's 64-hex hash key, the same as on the server
    hashKey?: string;
};

let current: QuardConfig = { origins: {} };

export function configure(options: Partial<QuardConfig>): void {
    current = { ...current, ...options, origins: { ...current.origins, ...options.origins } };
}

export function getConfig(): QuardConfig {
    return current;
}

export function resetConfig(): void {
    current = { origins: {} };
}
