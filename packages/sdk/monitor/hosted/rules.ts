import { getConfig } from "../../core/config.ts";
import type { GuardOptions, SourceOptions } from "../../guards/options.ts";
import { policyOptions } from "../../policy/state.ts";

// The rule name for every kind of hosted web search tool
export const WEB_SEARCH = "web_search";

// A hosted tool's rules: the policy file's, else the ones set in code
export function hostedOptions(tool: string): readonly GuardOptions[] {
    return policyOptions(tool) ?? getConfig().hostedTools?.[tool] ?? [];
}

export function webSearchRules(): SourceOptions[] {
    return hostedOptions(WEB_SEARCH).filter((options): options is SourceOptions => options.type === "source");
}
