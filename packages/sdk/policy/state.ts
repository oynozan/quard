import { dirname, isAbsolute, resolve } from "node:path";
import type { OriginOverrides } from "@quard/shared";
import { describeError } from "../core/errors.ts";
import { now, record } from "../core/recorder.ts";
import { DEFAULT_DETECTOR_RULES, type DetectorRules } from "../detectors/detector.ts";
import { fileSource } from "../feeds/file-source.ts";
import type { Source } from "../feeds/source.ts";
import { urlSource } from "../feeds/url-source.ts";
import type { GuardOptions } from "../guards/options.ts";
import { parseFeed, type CompiledFeed } from "../signatures/matcher.ts";
import { PRESETS, type Preset } from "./presets.ts";
import { parsePolicy, type PolicyFile, type RunLimitSettings, type SignaturesConfig } from "./schema.ts";

const DEFAULT_REFRESH_SECONDS = 300;

type Sources = {
    policy: Source<PolicyFile> | undefined;
    feed: Source<CompiledFeed | undefined> | undefined;
    // Settles when a URL feed's download in flight is done
    settled: () => Promise<void>;
    feedMode: "block" | "observe";
};

const DONE = (): Promise<void> => Promise.resolve();
const NONE: Sources = { policy: undefined, feed: undefined, settled: DONE, feedMode: "block" };
let sources = NONE;

function reportTo(source: "policy" | "signatures"): (message: string) => void {
    return (message) => record({ type: "config_error", at: now(), source, message });
}

function load<T>(what: string, open: () => T): T {
    try {
        return open();
    } catch (error) {
        throw new Error(`Quard could not load the ${what}: ${describeError(error)}`, { cause: error });
    }
}

// A relative feed path in a policy file is read from the policy file's folder
function besidePolicy(config: SignaturesConfig, policyFile: string): SignaturesConfig {
    return config.file !== undefined && !isAbsolute(config.file)
        ? { ...config, file: resolve(dirname(resolve(policyFile)), config.file) }
        : config;
}

// A feed file must be valid at once. A URL feed downloads in the
// background, and a failed download records a config_error.
function openFeed(config: SignaturesConfig): Pick<Sources, "feed" | "settled"> {
    const { file } = config;
    if (file !== undefined) {
        return {
            feed: load("signature feed", () => fileSource(file, parseFeed, reportTo("signatures"))),
            settled: DONE,
        };
    }
    const refreshMs = (config.refreshSeconds ?? DEFAULT_REFRESH_SECONDS) * 1000;
    const feed = urlSource(String(config.url), parseFeed, reportTo("signatures"), refreshMs);
    return { feed, settled: feed.settled };
}

// Throws if the policy file or a feed file is invalid. The sources in
// use stay until the new ones are open.
export function openSources(policyFile: string | undefined, signatures: SignaturesConfig | undefined): void {
    const policy =
        policyFile === undefined
            ? undefined
            : load("policy file", () => fileSource(policyFile, parsePolicy, reportTo("policy")));
    const fromPolicy = policy?.current().signatures;
    // The policy file's feed wins over the one set in code
    const config =
        fromPolicy !== undefined && policyFile !== undefined ? besidePolicy(fromPolicy, policyFile) : signatures;
    const opened = config === undefined ? { feed: undefined, settled: DONE } : openFeed(config);
    closeSources();
    sources = { policy, ...opened, feedMode: config?.mode ?? "block" };
}

export function closeSources(): void {
    sources.policy?.close();
    sources.feed?.close();
    sources = NONE;
}

// Rereads changed files. Cheap when no check is due.
export function refreshSources(at: number): void {
    sources.policy?.refresh(at);
    sources.feed?.refresh(at);
}

// Settles when a URL feed's download in flight is done
export function sourcesReady(): Promise<void> {
    return sources.settled();
}

// The policy file in force, a new object after each reload
export function currentPolicy(): PolicyFile | undefined {
    return sources.policy?.current();
}

// A tool named in the policy file uses the file's options, not its code options
export function policyOptions(tool: string): GuardOptions[] | undefined {
    return currentPolicy()?.guards?.[tool];
}

export function policyVersion(): string | undefined {
    const version = currentPolicy()?.version;
    return version === undefined ? undefined : String(version);
}

export function policyOrigins(): OriginOverrides | undefined {
    return currentPolicy()?.origins;
}

export function policyRunLimits(): RunLimitSettings | undefined {
    return currentPolicy()?.runLimits;
}

export function currentPreset(): Preset {
    return PRESETS[currentPolicy()?.strictness ?? "balanced"];
}

// A rule set to undefined, for example from an unset environment
// variable, keeps its default instead of turning the detector off
export function effectiveDetectorRules(fromCode: Partial<DetectorRules> | undefined): DetectorRules {
    const set = Object.fromEntries(Object.entries(fromCode ?? {}).filter(([, value]) => value !== undefined));
    return { ...DEFAULT_DETECTOR_RULES, ...set, ...currentPolicy()?.detector };
}

export function signatureFeed(): CompiledFeed | undefined {
    return sources.feed?.current();
}

// A feed is set, but no version of it has loaded yet
export function feedMissing(): boolean {
    return sources.feed !== undefined && sources.feed.current() === undefined;
}

// A mode in the policy file applies live
export function signatureMode(): "block" | "observe" {
    return currentPolicy()?.signatures?.mode ?? sources.feedMode;
}
