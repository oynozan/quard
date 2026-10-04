import type { OriginOverrides, RunEvent } from "@quard/shared";
import type { Detector, DetectorRules } from "../detectors/detector.ts";
import type { GuardOptions } from "../guards/options.ts";
import type { ArgumentLabel } from "../labels/value-labels.ts";
import { configureExtras, type RunLimitSettings, type SignaturesConfig } from "../policy/schema.ts";
import { closeSources, openSources, policyOrigins, policyRunLimits } from "../policy/state.ts";
import { describeError } from "./errors.ts";

export type ApprovalAnswer = "once" | "always" | "deny";

export type ApprovalRequest = {
    runId: string;
    agent: string;
    stepId: string;
    tool: string;
    input: unknown;
    values: ArgumentLabel[];
};

export type RunLimits = {
    // Product defaults start in observe mode
    mode: "block" | "observe";
    // Delegation levels below the agent that started the run
    depth: number;
    // Distinct helpers one agent delegates to
    fanOut: number;
    // Turns back and forth between the same two agents
    loops: number;
    // Model calls across all agents
    steps: number;
    // Estimated from token usage and the price table
    costUsd: number;
};

export const DEFAULT_RUN_LIMITS: RunLimits = {
    mode: "observe",
    depth: 3,
    fanOut: 10,
    loops: 5,
    steps: 200,
    costUsd: 5,
};

export type QuardConfig = {
    origins: OriginOverrides;
    onEvent?: (event: RunEvent) => void;
    // Asks a human in code, in place of the dashboard
    approver?: (request: ApprovalRequest) => Promise<ApprovalAnswer>;
    // The agent key. Webhook and control hand out the project's hash key to it.
    key?: string;
    // Uploads to webhook start once key and webhookUrl are set
    webhookUrl?: string;
    // The live link to control starts once key and controlUrl are set
    controlUrl?: string;
    // A JSON file with guard rules, reread while the app runs
    policyFile?: string;
    // A feed of known attack signatures, from a file or a URL
    signatures?: SignaturesConfig;
    // An AI check on source content, and when it may act
    detector?: Detector;
    detectorRules?: Partial<DetectorRules>;
    // Fields left out use DEFAULT_RUN_LIMITS
    runLimits?: Partial<RunLimits>;
    // Guard rules for hosted tools, by the name the model uses, such as
    // "web_search" or a hosted MCP tool's name
    hostedTools?: Record<string, GuardOptions[]>;
};

let current: QuardConfig = { origins: {} };

// Throws if an option, the policy file or a signature feed file is invalid
export function configure(options: Partial<QuardConfig>): void {
    const parsed = configureExtras.safeParse(options);
    if (!parsed.success) {
        throw new TypeError(`Invalid Quard configuration: ${describeError(parsed.error)}`);
    }
    const next = { ...current, ...options, origins: { ...current.origins, ...options.origins } };
    if ("policyFile" in options || "signatures" in options) {
        openSources(next.policyFile, next.signatures);
    }
    current = next;
}

// Origins from the policy file win over origins set in code
export function getConfig(): QuardConfig {
    const fromPolicy = policyOrigins();
    return fromPolicy === undefined ? current : { ...current, origins: { ...current.origins, ...fromPolicy } };
}

function setFields(settings: RunLimitSettings | undefined): RunLimitSettings {
    return Object.fromEntries(Object.entries(settings ?? {}).filter(([, value]) => value !== undefined));
}

// The limits in force: defaults, then code, then the policy file, field by field
export function runLimits(): RunLimits {
    return { ...DEFAULT_RUN_LIMITS, ...setFields(current.runLimits), ...setFields(policyRunLimits()) };
}

export function resetConfig(): void {
    closeSources();
    current = { origins: {} };
}
