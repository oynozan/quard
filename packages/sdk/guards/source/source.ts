import {
    emailHost,
    extractValues,
    hostMatches,
    labelFor,
    textOf,
    urlHost,
    type ExtractedValue,
    type Label,
    type OriginOverrides,
} from "@quard/shared";
import type { Carrier, Incoming } from "../../context/carrier.ts";
import { printOf } from "../../labels/print.ts";
import { recordValues, type ValueRecord } from "../../labels/records.ts";
import type { SourceOptions } from "../options.ts";
import { scanText, type Finding } from "./scan.ts";
import { mapStrings, stripSuspect } from "./strip.ts";

export type SourceDecision = "pass" | "strip" | "flag" | "block";

export type SourceResult = {
    decision: SourceDecision;
    // What the agent gets to read
    output: unknown;
    label: Label;
    findings: Finding[];
};

function hostOf(value: ExtractedValue): string {
    if (value.type === "email") {
        return emailHost(value.value);
    }
    return value.type === "url" ? urlHost(value.value) : value.value;
}

// The exact origin, such as "web:evil.com". A URL in the arguments wins
// over a bare host, which wins over an email address.
export function originFor(options: SourceOptions, input: unknown, tool: string): string {
    if (options.origin.includes(":")) {
        return options.origin;
    }
    const values = extractValues(textOf(input));
    const found =
        values.find((v) => v.type === "url") ??
        values.find((v) => v.type === "host") ??
        values.find((v) => v.type === "email");
    const name = options.originOf?.(input) ?? (found === undefined ? tool : hostOf(found));
    return `${options.origin}:${name}`;
}

// The host named in an origin, if it names one
function originHost(origin: string): string | undefined {
    const name = origin.slice(origin.indexOf(":") + 1);
    const host = name.includes("@") ? emailHost(name) : name.toLowerCase();
    return host.includes(".") ? host : undefined;
}

// An allowlist with no known host fails closed. A block list with no
// known host can't decide, so the content is flagged instead.
function checkDomain(options: SourceOptions, host: string | undefined): "blocked" | "unknown" | "ok" {
    if (host === undefined) {
        if (options.allowDomains !== undefined) {
            return "blocked";
        }
        return options.blockDomains === undefined ? "ok" : "unknown";
    }
    if (options.blockDomains?.some((pattern) => hostMatches(host, pattern)) === true) {
        return "blocked";
    }
    return options.allowDomains !== undefined && !options.allowDomains.some((pattern) => hostMatches(host, pattern))
        ? "blocked"
        : "ok";
}

// Labels, checks and scans what a source tool returned
export function checkSource(
    options: SourceOptions,
    origin: string,
    output: unknown,
    overrides: OriginOverrides,
): SourceResult {
    const domain = checkDomain(options, originHost(origin));
    const extra: Finding[] = domain === "unknown" ? ["unknown_host"] : [];
    const findings = [...scanText(textOf(output)), ...extra];
    let decision: SourceDecision = "pass";
    if (domain === "blocked") {
        decision = "block";
    } else if (findings.length > 0) {
        decision = options.onSuspect ?? "flag";
    }
    // Observe mode records the decision but changes nothing
    if ((options.mode ?? "block") === "observe") {
        return { decision, output, label: labelFor(origin, overrides), findings };
    }
    if (decision === "strip") {
        // Whatever is still suspect after stripping keeps the content flagged
        const shown = mapStrings(output, stripSuspect);
        const left = [...scanText(textOf(shown)), ...extra];
        return { decision, output: shown, label: labelFor(origin, overrides, left), findings };
    }
    return { decision, output, label: labelFor(origin, overrides, decision === "flag" ? findings : []), findings };
}

// What a receive guard learns about a message from another agent
export type Received = {
    origin: string;
    // The sender, or "unknown" when no record vouched for the message
    from: string;
    // A record of the same run and the same content vouched for the message
    verified: boolean;
    carrier: Carrier | undefined;
    // The origin overrides to label the message with
    overrides: OriginOverrides;
    // Values to index first, with the labels they had in the sender's run
    values: ValueRecord[];
};

// A message is vouched for only by a record of the same run and the
// same content. Anything else gets the agent default: untrusted.
export function receiveMessage(incoming: Incoming | undefined, output: unknown, overrides: OriginOverrides): Received {
    const carrier = incoming?.carrier;
    const found = incoming?.found;
    const origin = `agent:${found?.record.sender ?? "unknown"}`;
    const text = textOf(output);
    if (found === undefined || found.record.runId !== carrier?.runId || found.record.print !== printOf(output)) {
        const { trust, sensitivity } = labelFor(origin);
        const untrusted = { ...overrides, [origin]: { trust, sensitivity } };
        return { origin, from: "unknown", verified: false, carrier, overrides: untrusted, values: [] };
    }
    // A team's override for this exact origin still wins
    const own = Object.hasOwn(overrides, origin) ? overrides[origin] : undefined;
    const { trust, sensitivity } = found.record.label;
    const vouched = { ...overrides, [origin]: { trust, sensitivity, ...own } };
    const from = found.record.sender;
    return { origin, from, verified: true, carrier, overrides: vouched, values: recordValues(found, text) };
}
