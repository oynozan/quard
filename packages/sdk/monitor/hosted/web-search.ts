import { labelFor, urlHost } from "@quard/shared";
import { getConfig } from "../../core/config.ts";
import { checkDomain } from "../../guards/source/source.ts";
import { recordDecision } from "../../pipeline/checks.ts";
import { buildCall } from "../../pipeline/guard.ts";
import { indexContent } from "../input-labels.ts";
import { asRecord } from "../json.ts";
import type { Step } from "../step.ts";
import { WEB_SEARCH, webSearchRules } from "./rules.ts";

// Quard never sees the page text, only where it came from
const UNSCANNED = "unscanned";

function strings(values: unknown[]): string[] {
    return values.filter((value): value is string => typeof value === "string");
}

// URLs a web search call opened or listed as sources
function searchUrls(item: Record<string, unknown>): string[] {
    const action = asRecord(item.action);
    const sources = Array.isArray(action?.sources) ? action.sources : [];
    return strings([action?.url, ...sources.map((source) => asRecord(source)?.url)]);
}

// URLs a message cites
function citedUrls(item: Record<string, unknown>): string[] {
    const parts = Array.isArray(item.content) ? item.content : [];
    return strings(
        parts.flatMap((part) => {
            const notes = asRecord(part)?.annotations;
            return Array.isArray(notes)
                ? notes.map(asRecord).flatMap((note) => (note?.type === "url_citation" ? [note.url] : []))
                : [];
        }),
    );
}

export function consultedUrls(item: Record<string, unknown>): string[] {
    if (item.type === "web_search_call") {
        return searchUrls(item);
    }
    return item.type === "message" ? citedUrls(item) : [];
}

function hostOf(url: string): string | undefined {
    try {
        return urlHost(url) || undefined;
    } catch {
        return undefined;
    }
}

// Checks one consulted site against the web search rules. The search
// already ran, so a blocked site can only flag its content.
function checkHost(step: Step, host: string, urls: string[]): boolean {
    const call = buildCall(WEB_SEARCH, { urls }, step.scope, step.stepId);
    let blocked = false;
    for (const options of webSearchRules()) {
        const mode = options.mode ?? "block";
        const hit = checkDomain(options, host) === "blocked";
        recordDecision(call, {
            guard: "source",
            rule: "domain",
            decision: hit ? "flag" : "pass",
            mode,
            reason: hit ? "content_blocked" : undefined,
        });
        blocked ||= hit && mode === "block";
    }
    return blocked;
}

// Each consulted site becomes untrusted web content, flagged unscanned,
// so value tracing and the context label see it
export function labelWebSearch(step: Step, urls: readonly string[]): void {
    const byHost = new Map<string, string[]>();
    for (const url of urls) {
        const host = hostOf(url);
        if (host !== undefined) {
            byHost.set(host, [...(byHost.get(host) ?? []), url]);
        }
    }
    const overrides = getConfig().origins;
    for (const [host, list] of byHost) {
        const flags = checkHost(step, host, list) ? [UNSCANNED, "blocked_domain"] : [UNSCANNED];
        indexContent(step, list.join("\n"), labelFor(`web:${host}`, overrides, flags));
    }
}
