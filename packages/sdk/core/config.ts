import type { OriginOverrides, RunEvent } from "@quard/shared";
import type { Detector, DetectorRules } from "../detectors/detector.ts";
import type { ArgumentLabel } from "../labels/value-labels.ts";
import { configureExtras, type SignaturesConfig } from "../policy/schema.ts";
import { closeSources, openSources, policyOrigins } from "../policy/state.ts";
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
    // A JSON file with guard rules, reread while the app runs
    policyFile?: string;
    // A feed of known attack signatures, from a file or a URL
    signatures?: SignaturesConfig;
    // An AI check on source content, and when it may act
    detector?: Detector;
    detectorRules?: Partial<DetectorRules>;
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

export function resetConfig(): void {
    closeSources();
    current = { origins: {} };
}
