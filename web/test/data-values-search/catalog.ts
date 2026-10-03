import { indexed } from "@/lib/data/values/content-index";
import type { CatalogRun } from "@/lib/data/runs/catalog";
import type { RawArg } from "@/lib/data/runs/build/state";
import type { Step } from "@/lib/data/runs/types";
import type { Label, StepKind, ValueKind } from "@/lib/data/types";

// Small hand-built runs for the search index. Only the fields search reads are filled in.

export const WEB: Label = { origin: "web", trust: "untrusted", sensitivity: "public" };
export const USER: Label = { origin: "user", trust: "trusted", sensitivity: "internal" };

export const RUN_A = "a".repeat(32);

type StepSpec = { id: string; agent: string; kind: StepKind; name: string; at: number };
type ValueSpec = { stepId: string; raw: string; kind: ValueKind; at: number; agent?: string; label?: Label };
type ArgSpec = ValueSpec & { name: string; tool: string };

export function step({ id, agent, kind, name, at }: StepSpec): Step {
    return { id, agent, kind, name, startedAt: at, context: USER } as Step;
}

export function catalogRun(runId: string, steps: Step[], values: ValueSpec[], args: ArgSpec[]): CatalogRun {
    const index = values.map((v) => indexed(v.raw, v.kind, v.label ?? WEB, v.stepId, v.agent ?? "billing", v.at));
    const rawArgs: RawArg[] = args.map((a) => ({
        stepId: a.stepId,
        agent: a.agent ?? "billing",
        tool: a.tool,
        name: a.name,
        raw: a.raw,
        kind: a.kind,
        label: a.label ?? WEB,
        at: a.at,
    }));
    return {
        built: { index, rawArgs },
        detail: { summary: { id: runId }, steps },
    } as unknown as CatalogRun;
}

// One run with a value of every kind search cares about.
export function runA(): CatalogRun {
    const steps = [
        step({ id: "s1", agent: "billing", kind: "model_call", name: "gpt-5", at: 10 }),
        step({ id: "s2", agent: "billing", kind: "tool_call", name: "fetch_page", at: 20 }),
        step({ id: "s3", agent: "billing", kind: "tool_call", name: "fetch_page", at: 30 }),
        step({ id: "s4", agent: "researcher", kind: "handoff", name: "researcher", at: 40 }),
        step({ id: "s5", agent: "researcher", kind: "message", name: "billing", at: 50 }),
        step({ id: "s6", agent: "billing", kind: "memory_read", name: "payees", at: 60 }),
    ];
    const values: ValueSpec[] = [
        { stepId: "s1", raw: "mail.acme.co.uk", kind: "domain", at: 11 },
        { stepId: "s2", raw: "https://www.supplier-portal.example/suppliers/SUP-004417", kind: "url", at: 21 },
        { stepId: "s2", raw: "Quarterly invoice run notes", kind: "text", at: 22 },
        { stepId: "s4", raw: "INV-20931", kind: "id", at: 41, agent: "researcher" },
        { stepId: "s5", raw: "remit@northwind-payments.example", kind: "email", at: 51, agent: "researcher" },
        { stepId: "s6", raw: "DE89 3704 0044 0532 0130 00", kind: "iban", at: 61 },
        { stepId: "s6", raw: "DE89 3704 0044 0532 0130 00", kind: "iban", at: 61 },
        { stepId: "gone", raw: "INV-20931", kind: "id", at: 70 },
    ];
    const args: ArgSpec[] = [
        {
            stepId: "s3",
            tool: "fetch_page",
            name: "url",
            raw: "https://pay.nwparts-secure.example/x",
            kind: "url",
            at: 31,
        },
        { stepId: "s3", tool: "fetch_page", name: "amount", raw: "4,950.00 EUR", kind: "amount", at: 32 },
        {
            stepId: "s3",
            tool: "fetch_page",
            name: "note",
            raw: "Send to DE89 3704 0044 0532 0130 00 ref INV-20931",
            kind: "text",
            at: 33,
        },
    ];
    return catalogRun(RUN_A, steps, values, args);
}

// Many small runs by the support agent, enough to pass the search limit.
export function supportRuns(count: number): CatalogRun[] {
    return Array.from({ length: count }, (_, i) => {
        const id = i.toString(16).padStart(32, "0");
        return catalogRun(
            id,
            [step({ id: "t1", agent: "support", kind: "message", name: "billing", at: 1000 + i })],
            [],
            [],
        );
    });
}
