import { createHash } from "node:crypto";
import { canonicalJson, type RuleEntry, type RulesSnapshot } from "@quard/shared";
import { runLimits, type RunLimits } from "../core/config.ts";
import { guardedToolOptions, guardedToolsRevision } from "../context/registry.ts";
import { ruleName } from "../guards/action/action.ts";
import { limitRules } from "../guards/limit/limit.ts";
import type { Mode } from "../guards/call.ts";
import type { GuardOptions } from "../guards/options.ts";
import { x402Rules } from "../guards/x402/settings.ts";
import { currentPolicy, policyOptions, policyVersion, signatureMode } from "./state.ts";

const MAX_NAME = 200;
const MAX_ENTRIES = 5000;
const EGRESS_RULES = ["untrusted-destination", "allowlist", "payload:secrets", "payload:cards", "payload:ibans"];
const RUN_LIMIT_RULES = ["max-depth", "max-fan-out", "max-loops", "max-steps", "max-cost"];
// Run limits cover the whole run, not one tool
const WHOLE_RUN = "*";

type Cached = { tools: number; policy: unknown; signatures: string; limits: string; snapshot: RulesSnapshot };

let cached: Cached | undefined;

// Control limits names to 200 characters and refuses empty ones
function clip(text: string): string {
    return text === "" ? "-" : text.slice(0, MAX_NAME);
}

function ruleNames(options: GuardOptions): Array<[guard: string, rule: string, mode?: Mode]> {
    switch (options.type) {
        case "source":
            return [["source", "source"]];
        case "approval":
            return [["approval", "approval"]];
        case "action":
            return options.rules.map((rule) => ["action", ruleName(rule)]);
        case "egress":
            return EGRESS_RULES.map((rule) => ["egress", rule]);
        case "limit":
            return limitRules(options).map((rule) => ["limit", rule]);
        // Its product defaults run in observe mode, so each rule has its own
        case "x402":
            return x402Rules(options).map(({ rule, mode }) => ["x402", rule, mode]);
    }
}

function entriesOf(tool: string, options: GuardOptions): RuleEntry[] {
    const mode = options.type === "approval" ? "block" : (options.mode ?? "block");
    return ruleNames(options).map(([guard, rule, own]) => ({
        tool: clip(tool),
        guard,
        rule: clip(rule),
        mode: own ?? mode,
    }));
}

// Functions can't be hashed, so each becomes its rule's or its option's name
function hashable(options: GuardOptions): unknown {
    const plain = Object.fromEntries(
        Object.entries(options).map(([key, value]) => [key, typeof value === "function" ? key : value]),
    );
    if (options.type !== "action") {
        return plain;
    }
    return { ...plain, rules: options.rules.map((rule) => ("check" in rule ? { ...rule, check: rule.name } : rule)) };
}

function build(limits: RunLimits): RulesSnapshot {
    const tools = [...guardedToolOptions()]
        .map(([tool, code]) => [tool, policyOptions(tool) ?? code] as const)
        .sort(([a], [b]) => (a < b ? -1 : 1));
    const effective = {
        tools: tools.map(([tool, list]) => [tool, list.map(hashable)]),
        policy: policyVersion() ?? null,
        strictness: currentPolicy()?.strictness ?? "balanced",
        signatures: signatureMode(),
        runLimits: limits,
    };
    const runRules = RUN_LIMIT_RULES.map((rule) => ({ tool: WHOLE_RUN, guard: "limit", rule, mode: limits.mode }));
    return {
        hash: createHash("sha256").update(canonicalJson(effective)).digest("hex").slice(0, 16),
        list: [
            ...runRules,
            ...tools.flatMap(([tool, list]) => list.flatMap((options) => entriesOf(tool, options))),
        ].slice(0, MAX_ENTRIES),
    };
}

// The active rules, built again only when a guard registers or a setting changes
export function rulesSnapshot(): RulesSnapshot {
    const tools = guardedToolsRevision();
    const policy = currentPolicy();
    const signatures = signatureMode();
    const limits = runLimits();
    const limitsId = JSON.stringify(limits);
    if (
        cached?.tools !== tools ||
        cached.policy !== policy ||
        cached.signatures !== signatures ||
        cached.limits !== limitsId
    ) {
        cached = { tools, policy, signatures, limits: limitsId, snapshot: build(limits) };
    }
    return cached.snapshot;
}

// The hash every decision event carries, once a guarded tool exists
export function rulesHash(): string | undefined {
    return guardedToolOptions().size === 0 ? undefined : rulesSnapshot().hash;
}
