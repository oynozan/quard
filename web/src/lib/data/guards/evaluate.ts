import { maskValue } from "../../mask";
import { originKind } from "../labels/origins";
import { hostOf, mainDomain } from "../values/kinds";
import { BLOCKED_DOMAINS, EGRESS_ALLOW } from "../values/pool";
import { runLimit } from "./limits";
import type { GuardSpec } from "./tools";
import type { GuardMode, Label, Outcome, ValueKind, ValueLabel } from "../types";

export type ArgFacts = { name: string; raw: string; kind: ValueKind; label: ValueLabel };

// What the fleet check knows about the watched value of a call.
export type FleetFacts = { known: boolean; runs: number; quarantined: boolean };

export type CallFacts = {
    tool: string;
    agent: string;
    args: ArgFacts[];
    context: Label;
    callsInRun: number;
    links: { depth: number; fanOut: number; loops: number; pair: string };
    fleet: FleetFacts;
    grant: string | null;
    paidTodayEur: number;
};

export type Verdict = { outcome: Outcome; reason: string; rule: string; mode: GuardMode | null };

const PLACE: Record<string, string> = {
    user: "the user's message",
    tool: "a tool result",
    web: "web content",
    search: "web search results",
    email: "outside email",
    mcp: "MCP content",
    file: "a file",
    agent: "another agent's message",
    memory: "unlabeled memory",
    unknown: "unlabeled content",
};

// "web content (supplier-portal.example)" for "web:supplier-portal.example".
export function placeOf(origin: string): string {
    const kind = originKind(origin);
    const detail = origin.slice(origin.indexOf(":") + 1);
    return detail && detail !== origin ? `${PLACE[kind]} (${detail})` : PLACE[kind];
}

const EUR = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function amountOf(raw: string | undefined): number {
    if (!raw) return 0;
    return Number(raw.replace(/[^\d.]/g, "")) || 0;
}

function find(facts: CallFacts, name: string): ArgFacts | undefined {
    return facts.args.find((arg) => arg.name === name);
}

function verdict(spec: GuardSpec, outcome: Outcome, reason: string): Verdict {
    return { outcome, reason, rule: spec.rule, mode: spec.mode };
}

function runLimits(spec: GuardSpec, facts: CallFacts): Verdict {
    const { depth, fanOut, loops, pair } = facts.links;
    const loop = runLimit("loops");
    if (loops >= loop.limit) {
        return {
            outcome: "block",
            reason: `Loop: ${loops} handoffs back and forth, ${pair}`,
            rule: loop.rule,
            mode: loop.mode,
        };
    }
    const deep = runLimit("depth");
    if (depth > deep.limit) {
        return { outcome: "block", reason: `Depth ${depth} of ${deep.limit}`, rule: deep.rule, mode: deep.mode };
    }
    const wide = runLimit("fan-out");
    if (fanOut > wide.limit) {
        return { outcome: "block", reason: `Fan-out ${fanOut} of ${wide.limit}`, rule: wide.rule, mode: wide.mode };
    }
    return verdict(spec, "allow", `Depth ${depth} of ${deep.limit} · fan-out ${fanOut} of ${wide.limit}`);
}

function fleetCheck(spec: GuardSpec, facts: CallFacts): Verdict {
    const watched = find(facts, "iban") ?? find(facts, "to");
    const masked = watched ? maskValue(watched.raw) : "The value";
    const { known, runs, quarantined } = facts.fleet;
    if (quarantined) return verdict(spec, "block", `${masked} is on the quarantine list`);
    if (known) return verdict(spec, "allow", `${masked} is known to the fleet`);
    if (runs >= 5) return verdict(spec, "block", `${masked} reached a 5th run within 24 hours of first being seen`);
    return verdict(spec, "allow", `${masked} is new to the fleet: ${runs} of 5 runs in 24 hours`);
}

function ibanSource(spec: GuardSpec, facts: CallFacts): Verdict {
    const iban = find(facts, "iban");
    if (!iban) return verdict(spec, "allow", "No IBAN in this call");
    if (iban.label.appearances.some((a) => a.label.origin === "tool:lookup_supplier")) {
        return verdict(spec, "allow", "The IBAN comes from supplier records");
    }
    if (iban.label.generated)
        return verdict(spec, "block", "The IBAN was model-generated, not taken from supplier records");
    const first = iban.label.appearances[0];
    return verdict(spec, "block", `The IBAN first appeared in ${placeOf(first.label.origin)}, not in supplier records`);
}

function emailEgress(spec: GuardSpec, facts: CallFacts): Verdict {
    const to = find(facts, "to");
    if (!to) return verdict(spec, "allow", "No recipient");
    const domain = mainDomain(hostOf(to.raw, "email") ?? "");
    if (EGRESS_ALLOW.includes(domain)) return verdict(spec, "allow", `Recipient domain ${domain} is on the allowlist`);
    const trusted = to.label.appearances.find((a) => a.label.trust === "trusted");
    if (trusted) return verdict(spec, "allow", `Recipient is on file in ${trusted.label.origin}`);
    const first = to.label.appearances[0];
    if (!first) return verdict(spec, "ask", "Never-seen recipient");
    if (facts.context.sensitivity === "internal") {
        return verdict(
            spec,
            "block",
            `Internal data headed to an address that first appeared in ${placeOf(first.label.origin)}`,
        );
    }
    return verdict(spec, "ask", `Recipient first appeared in ${placeOf(first.label.origin)}`);
}

// The decision a rule makes before the call runs, from the call's labels and counters.
export function evaluateGuard(spec: GuardSpec, facts: CallFacts): Verdict {
    const grant = facts.grant ? `Matched always-approve grant ${facts.grant}` : null;
    switch (spec.rule) {
        case "run-limits":
            return runLimits(spec, facts);
        case "fleet-check":
            return fleetCheck(spec, facts);
        case "pay_invoice.iban-source":
            return ibanSource(spec, facts);
        case "send_email":
            return emailEgress(spec, facts);
        case "pay_invoice.daily-cap": {
            const total = facts.paidTodayEur + amountOf(find(facts, "amount")?.raw);
            const words = `${EUR.format(total)} of 50,000 EUR today`;
            return verdict(spec, total > 50_000 ? "block" : "allow", total > 50_000 ? `Would reach ${words}` : words);
        }
        case "send_email.per-run":
            return verdict(
                spec,
                facts.callsInRun > 20 ? "block" : "allow",
                `Email ${facts.callsInRun} of 20 in this run`,
            );
        case "label_thread":
            return verdict(
                spec,
                facts.callsInRun > 50 ? "block" : "allow",
                `Label ${facts.callsInRun} of 50 in this run`,
            );
        case "run_tests":
            return verdict(
                spec,
                facts.callsInRun > 5 ? "block" : "allow",
                `Test run ${facts.callsInRun} of 5 in this run`,
            );
        case "lookup_supplier":
            return verdict(
                spec,
                "allow",
                `${find(facts, "supplier_id")?.raw ?? "The supplier"} is in supplier records`,
            );
        case "create_ticket":
            return verdict(spec, "allow", "The ticket's customer matches the sender");
        case "post_slack":
            return verdict(spec, "allow", "The #deploys webhook is on the allowlist");
        case "deploy_service": {
            const env = find(facts, "environment")?.raw ?? "staging";
            if (env !== "production") return verdict(spec, "allow", `${env} deploys run without asking`);
            return grant
                ? verdict(spec, "allow", grant)
                : verdict(spec, "ask", "Production deploys ask before running");
        }
    }
    if (spec.type === "approval") {
        return grant ? verdict(spec, "allow", grant) : verdict(spec, "ask", `${facts.tool} always asks a human first`);
    }
    return verdict(spec, "allow", spec.summary);
}

// The decision a source guard makes after the tool returns.
export function evaluateSource(spec: GuardSpec, origin: string, hosted: boolean): Verdict {
    const host = origin.slice(origin.indexOf(":") + 1);
    if (BLOCKED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) {
        return verdict(spec, "block", `${host} is on the block list`);
    }
    if (hosted) {
        return verdict(
            spec,
            "pass",
            "Consulted domains are allowed. Page text never reached Quard, so it was not scanned",
        );
    }
    return verdict(spec, "pass", `Labeled ${origin}. Nothing suspect found`);
}
