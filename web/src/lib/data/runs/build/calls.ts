import { maskText, maskValue } from "../../../mask";
import { costOf } from "../../agents/prices";
import { versionAt } from "../../agents/versions";
import { amountOf, type ArgFacts, type CallFacts, type FleetFacts } from "../../guards/evaluate";
import { toolSpec } from "../../guards/tools";
import { labelFor, USER_LABEL } from "../../labels/origins";
import { classify, hostOf } from "../../values/kinds";
import { askHuman, type ApprovalPlan, type AskResult } from "./approval";
import { runChecks, runSourceCheck, type Overrides } from "./checks";
import type { BuildState, Mark, ValueSpec } from "./state";
import type { Label, ValueKind } from "../../types";
import type { Step, StepArg } from "../types";

export type ModelOptions = {
    // A message the model reads in this call, labeled "user" unless a label is given.
    input?: { text: string; values?: ValueSpec[]; label?: Label };
    calls?: string[];
    tokens?: [number, number];
    durationMs?: number;
    // Hosted web search inside this call. Only queries and source URLs reach Quard.
    search?: { query: string; sources: string[] };
    detail?: string;
    error?: string;
    mark?: Mark;
    searchMark?: Mark;
};

export type ToolOptions = {
    args: Record<string, string>;
    kinds?: Record<string, ValueKind>;
    output?: { summary: string; origin?: string; values?: ValueSpec[] };
    decide?: Overrides;
    fleet?: FleetFacts;
    grant?: string;
    links?: CallFacts["links"];
    approval?: ApprovalPlan;
    durationMs?: number;
    error?: string;
    detail?: string;
    parentId?: string | null;
    mark?: Mark;
};

export type ToolResult = { step: Step; result: "ran" | "blocked" | "error" | Exclude<AskResult, "approved"> };

const DURATION: Record<string, [number, number]> = {
    fetch_page: [600, 2400],
    lookup_supplier: [120, 600],
    get_invoice_pdf: [200, 900],
    pay_invoice: [400, 1500],
    send_email: [250, 900],
    read_inbox: [300, 1200],
    search_docs: [250, 900],
    crm_lookup: [150, 700],
    create_ticket: [200, 600],
    refund_order: [300, 1100],
    export_contacts: [800, 3000],
    label_thread: [60, 220],
    receive_message: [20, 90],
    run_tests: [20_000, 80_000],
    read_build_log: [150, 600],
    deploy_service: [30_000, 110_000],
    rollback_service: [20_000, 60_000],
    post_slack: [120, 400],
    delegate: [15, 60],
    summarize: [40, 200],
};

export function toStepArg(fact: ArgFacts): StepArg {
    const value = fact.kind === "text" ? maskText(fact.raw) : maskValue(fact.raw);
    return { name: fact.name, value, masked: value !== fact.raw, valueLabel: fact.label };
}

function defaultOrigin(name: string, args: Record<string, string>): string {
    switch (name) {
        case "fetch_page":
            return `web:${hostOf(args.url ?? "", "url") ?? "unknown"}`;
        case "web_search":
            return "search:hosted";
        case "search_docs":
            return "mcp:docs.acme.internal";
        case "crm_lookup":
            return "mcp:crm.acme.internal";
        case "get_invoice_pdf":
            return `file:${args.path ?? "unknown"}`;
        case "receive_message":
            return `agent:${args.from ?? "unknown"}`;
    }
    return toolSpec(name).guards.length > 0 ? `tool:${name}` : `unknown:${name}`;
}

function defaultDetail(name: string, args: Record<string, string>): string {
    if (name === "fetch_page") return `GET ${(args.url ?? "").replace(/^https?:\/\//, "")}`;
    if (name === "pay_invoice") return `${args.amount ?? ""} to ${maskValue(args.iban ?? "")}`;
    if (name === "send_email") return `To ${maskValue(args.to ?? "")}`;
    if (name === "delegate") return `To ${args.to ?? ""}`;
    if (name === "read_inbox") return `Unread mail in ${args.mailbox ?? "the inbox"}`;
    const first = Object.values(args)[0] ?? "";
    return maskText(first.length > 64 ? `${first.slice(0, 63)}…` : first);
}

export function modelCall(s: BuildState, agent: string, opts: ModelOptions = {}): Step {
    const version = versionAt(agent, s.clock);
    const inputLabel = opts.input?.label ?? USER_LABEL;
    if (opts.input) s.see(agent, [inputLabel]);
    if (opts.search) s.see(agent, [labelFor("search:hosted")]);
    const [input, output] = opts.tokens ?? [s.int(1800, 9800), s.int(60, 640)];
    const cached = Math.round(input * s.float(0.1, 0.6));
    const durationMs = opts.durationMs ?? Math.round(500 + output * s.float(9, 16));
    const step = s.step(agent, "model_call", version.model, s.session.get(agent) ?? null, durationMs);
    const calls = opts.calls ?? [];
    step.model = {
        model: version.model,
        inputTokens: input,
        cachedTokens: cached,
        outputTokens: output,
        costUsd: costOf(version.model, input, cached, output),
        toolCalls: calls,
    };
    step.detail = opts.detail ?? (calls.length ? `Asked for ${calls.join(", ")}` : "Answered");
    if (opts.input) s.remember(opts.input.values ?? [], inputLabel, step.id, agent, step.startedAt);
    if (opts.error) {
        step.status = "error";
        step.error = opts.error;
    }
    if (opts.mark) s.mark(opts.mark, step.id);
    s.lastModel.set(agent, step.id);
    if (opts.search) hostedSearch(s, agent, step, opts.search, opts.searchMark);
    s.clock = step.startedAt + durationMs;
    s.wait(s.int(15, 120));
    return step;
}

// Hosted search runs inside the model call. Its pages are never scanned.
function hostedSearch(s: BuildState, agent: string, model: Step, search: ModelOptions["search"], mark?: Mark) {
    if (!search) return;
    s.clock = model.startedAt + Math.round(model.durationMs * 0.2);
    toolCall(s, agent, "web_search", {
        args: { query: search.query },
        kinds: { query: "text" },
        parentId: model.id,
        mark,
        durationMs: Math.round(model.durationMs * 0.45),
        output: {
            summary: `${search.sources.length} sources consulted. Page text never reached Quard`,
            values: search.sources.map((url) => ({ value: url, kind: "url" as const })),
        },
        detail: `${search.sources.length} sources · unscanned`,
    });
}

export function toolCall(s: BuildState, agent: string, name: string, opts: ToolOptions): ToolResult {
    const spec = toolSpec(name);
    const parentId = opts.parentId !== undefined ? opts.parentId : s.parentFor(agent);
    const call = s.step(agent, "tool_call", name, parentId, 0);
    call.hosted = spec.hosted;
    call.detail = opts.detail ?? defaultDetail(name, opts.args);
    if (opts.mark) s.mark(opts.mark, call.id);

    const facts: ArgFacts[] = Object.entries(opts.args).map(([argName, raw]) => {
        const kind = opts.kinds?.[argName] ?? classify(raw);
        return { name: argName, raw, kind, label: s.trace(raw, kind) };
    });
    call.args = facts.map(toStepArg);
    for (const fact of facts) {
        const label = fact.label.appearances[0]?.label ?? call.context;
        s.rawArgs.push({
            stepId: call.id,
            agent,
            tool: name,
            name: fact.name,
            raw: fact.raw,
            kind: fact.kind,
            label,
            at: call.startedAt,
        });
    }

    const checked = runChecks(
        s,
        agent,
        call,
        spec,
        {
            tool: name,
            agent,
            args: facts,
            context: call.context,
            callsInRun: s.countCall(name),
            links: opts.links ?? { depth: 0, fanOut: 0, loops: 0, pair: "" },
            fleet: opts.fleet ?? { known: true, runs: 1, quarantined: false },
            grant: opts.grant ?? null,
            paidTodayEur: s.paidTodayEur,
        },
        opts.decide ?? {},
    );
    if (checked === "block") {
        call.status = "blocked";
        return done(s, call, "blocked");
    }
    if (checked === "ask") {
        const answer = askHuman(s, agent, call, facts, opts.approval);
        if (answer === "waiting") return { step: call, result: "waiting" };
        if (answer !== "approved") return done(s, call, answer);
    }

    // The tool runs with exactly the checked arguments.
    const [min, max] = DURATION[name] ?? [100, 900];
    s.wait(opts.durationMs ?? s.int(min, max));
    if (opts.error) {
        call.status = "error";
        call.error = opts.error;
        return done(s, call, "error");
    }
    if (name === "pay_invoice") s.paidTodayEur += amountOf(opts.args.amount);
    if (opts.output) {
        const origin = opts.output.origin ?? defaultOrigin(name, opts.args);
        const label = labelFor(origin);
        call.output = { label, summary: maskText(opts.output.summary) };
        if (runSourceCheck(s, agent, call, spec, origin, opts.decide ?? {}) === "block") {
            call.status = "blocked";
            return done(s, call, "blocked");
        }
        s.remember(opts.output.values ?? [], label, call.id, agent);
        s.see(agent, [label]);
    }
    return done(s, call, "ran");
}

function done(s: BuildState, call: Step, result: ToolResult["result"]): ToolResult {
    call.durationMs = Math.max(1, s.clock - call.startedAt);
    s.wait(s.int(8, 60));
    return { step: call, result };
}
