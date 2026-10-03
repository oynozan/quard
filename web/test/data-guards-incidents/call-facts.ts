import { TOOLS, type GuardSpec } from "@/lib/data/guards/tools";
import { evaluateGuard, type ArgFacts, type CallFacts } from "@/lib/data/guards/evaluate";
import { NOW } from "@/lib/data/rng";
import type { Label, Sensitivity, Trust, ValueKind } from "@/lib/data/types";

// Small builders for guard rule tests.

export const IBAN = "DE89370400440532013000";

export function specOf(rule: string): GuardSpec {
    const spec = TOOLS.flatMap((tool) => tool.guards).find((guard) => guard.rule === rule);
    if (!spec) throw new Error(`no rule ${rule}`);
    return spec;
}

export function label(origin: string, trust: Trust = "untrusted", sensitivity: Sensitivity = "public"): Label {
    return { origin, trust, sensitivity };
}

// An argument and every earlier place its value appeared, first one first.
export function arg(name: string, raw: string, kind: ValueKind, origins: Label[] = [], generated = false): ArgFacts {
    const appearances = origins.map((item) => ({
        label: item,
        stepId: "s1",
        agent: "billing",
        at: NOW,
        match: "exact" as const,
    }));
    return { name, raw, kind, label: { kind, traced: true, generated, appearances } };
}

export function facts(fields: Partial<CallFacts> = {}): CallFacts {
    return {
        tool: "pay_invoice",
        agent: "billing",
        args: [],
        context: label("user", "trusted", "public"),
        callsInRun: 1,
        links: { depth: 1, fanOut: 1, loops: 0, pair: "orchestrator and billing" },
        fleet: { known: true, runs: 1, quarantined: false },
        grant: null,
        paidTodayEur: 0,
        ...fields,
    };
}

// The verdict of the named rule for a call.
export function check(rule: string, fields: Partial<CallFacts> = {}) {
    return evaluateGuard(specOf(rule), facts(fields));
}
