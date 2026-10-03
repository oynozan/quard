import { emailHost, extractValues, hostMatches, normalizeEmail, urlHost } from "@quard/shared";
import type { Match } from "../../labels/content-index.ts";
import { firstAppearance, labelArguments } from "../../labels/value-labels.ts";
import type { GuardCall, Mode, RuleResult } from "../call.ts";
import type { EgressOptions } from "../options.ts";
import { checkPayload } from "./payload.ts";

const DESTINATION_FIELDS = /^(to|cc|bcc|recipients?|emails?|url|endpoint|host|webhook|target|destination)$/i;

type Target = { host: string; email: string | undefined };

// Reads destinations from fields such as to, cc, url or webhook
export function defaultDestinations(input: unknown): string[] {
    if (input === null || typeof input !== "object") {
        return [];
    }
    return Object.entries(input)
        .filter(([key]) => DESTINATION_FIELDS.test(key))
        .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
        .filter((value): value is string => typeof value === "string");
}

function targetsOf(destination: string): Target[] {
    return extractValues(destination).flatMap((value): Target[] => {
        if (value.type === "email") {
            return [{ host: emailHost(value.value), email: value.value }];
        }
        if (value.type === "url") {
            return [{ host: urlHost(value.value), email: undefined }];
        }
        return value.type === "host" ? [{ host: value.value, email: undefined }] : [];
    });
}

function allowedTarget(target: Target, patterns: readonly string[]): boolean {
    return patterns.some((pattern) =>
        pattern.includes("@") ? target.email === normalizeEmail(pattern) : hostMatches(target.host, pattern),
    );
}

function allAllowed(targets: readonly Target[], patterns: readonly string[]): boolean {
    return targets.length > 0 && targets.every((target) => allowedTarget(target, patterns));
}

function result(rule: string, mode: Mode, failed: RuleResult | undefined): RuleResult {
    return failed ?? { guard: "egress", rule, decision: "allow", mode };
}

export function checkEgress(call: GuardCall, options: EgressOptions): RuleResult[] {
    const mode = options.mode ?? "block";
    const allow = options.allow ?? [];
    const destinations = (options.destinations ?? defaultDestinations)(call.input);

    // Never to a destination that first appeared in untrusted content, judged by
    // the strongest match. A main-domain match alone is ignored when allowlisted.
    const fromUntrusted = destinations.some((destination) => {
        const matches: Match[] = allAllowed(targetsOf(destination), allow)
            ? ["exact", "host"]
            : ["exact", "host", "domain"];
        return labelArguments(destination, call.run.index)
            .flatMap((label) => label.values)
            .some((value) => firstAppearance(value, matches)?.trust === "untrusted");
    });

    // Internal data only goes to allowlisted destinations
    const internal =
        call.context.sensitivity === "internal" ||
        call.values.some((label) => label.values.some((v) => v.occurrences.some((o) => o.sensitivity === "internal")));
    const allowed = allAllowed(destinations.flatMap(targetsOf), allow);

    return [
        result(
            "untrusted-destination",
            mode,
            fromUntrusted
                ? {
                      guard: "egress",
                      rule: "untrusted-destination",
                      decision: "block",
                      mode,
                      reason: "destination_from_untrusted_content",
                  }
                : undefined,
        ),
        result(
            "allowlist",
            mode,
            internal && !allowed
                ? {
                      guard: "egress",
                      rule: "allowlist",
                      decision: options.onFail ?? "block",
                      mode,
                      reason: "destination_not_allowed",
                  }
                : undefined,
        ),
        ...checkPayload(call, options),
    ];
}
