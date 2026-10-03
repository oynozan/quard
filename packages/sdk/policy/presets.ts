import type { DataAction } from "../guards/options.ts";

export type Strictness = "lenient" | "balanced" | "strict";

export type Preset = {
    // What a source guard does with suspect content, unless it says
    onSuspect: "flag" | "strip" | "block";
    payload: { secrets: DataAction; cards: DataAction; ibans: DataAction };
};

// Defaults a policy file's strictness sets. Without a policy file the
// balanced preset applies, which matches the guards' own defaults.
export const PRESETS: Record<Strictness, Preset> = {
    lenient: { onSuspect: "flag", payload: { secrets: "mask", cards: "mask", ibans: "allow" } },
    balanced: { onSuspect: "flag", payload: { secrets: "block", cards: "mask", ibans: "allow" } },
    strict: { onSuspect: "block", payload: { secrets: "block", cards: "block", ibans: "mask" } },
};
