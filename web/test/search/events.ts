import type { ingestBatch } from "@quard/db";

// Shared event schema types, as ingestBatch takes them
export type Item = Parameters<typeof ingestBatch>[2][number];
export type RunEvent = Item["event"];
type Content = Extract<RunEvent, { type: "content" }>;
type Label = Pick<Content, "origin" | "trust" | "sensitivity">;
type Run = { runId: string; agent: string };

export const T0 = Date.UTC(2026, 9, 3, 12, 0, 0);
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

export const INVOICE_RUN = "4bf92f3577b34da6a3ce929d0e0e4736";
export const DOCS_RUN = "c3a8f0d2e5b14976a0c2d8e1f6b3a947";
const INVOICE: Run = { runId: INVOICE_RUN, agent: "billing" };
const DOCS: Run = { runId: DOCS_RUN, agent: "researcher" };

export const READ = "1111111111111111";
export const PAY = "2222222222222222";
export const FETCH = "3333333333333333";
export const FILE = "4444444444444444";
// A model step whose own event has not been stored yet
export const LATER = "5555555555555555";

export const IBAN = "DE89370400440532013000";
// The same IBAN as a person might type it
export const IBAN_TYPED = "de89 3704 0044 0532 0130 00";
export const IBAN_MASK = "DE89…3000";
// Hashed with the project's own key when the runs are stored
const IBAN_KEY = `iban:${IBAN}`;
export const INVOICE_ID = "INV-20931";
// ID keys are lowercase
export const INVOICE_SHOWN = INVOICE_ID.toLowerCase();
export const PAY_HOST = "pay.example.com";
export const PAY_URL = `https://${PAY_HOST}/invoices/${INVOICE_ID}`;
export const MAIN_DOMAIN = "example.com";
const DOCS_URL = "https://docs.example.com/guide";
export const PATH = "/srv/exports/q3.csv";
export const PATH_KEY = `path:${PATH}`;
// Values no run holds
export const EMAIL = "user@example.com";
export const EMAIL_MASK = "u…@example.com";
export const CARD = "4111 1111 1111 1111";

export const WEB: Label = { origin: "web:example.net", trust: "untrusted", sensitivity: "public" };
export const FILE_LABEL: Label = { origin: "file:/srv/exports", trust: "untrusted", sensitivity: "internal" };
export const USER: Label = { origin: "user", trust: "trusted", sensitivity: "internal" };

let next = 0;

// Each event in its upload envelope, with a fresh id
export function items(events: RunEvent[]): Item[] {
    return events.map((event) => ({ id: (++next).toString(16).padStart(16, "0"), event }));
}

function read(run: Run, stepId: string, seconds: number, label: Label, keys: string[]): RunEvent {
    return { type: "content", ...run, stepId, at: at(seconds), contentId: `c${seconds}`, ...label, flags: [], keys };
}

function call(run: Run, stepId: string, seconds: number, tool: string, args: object, keys: string[]): RunEvent {
    return {
        type: "tool_call",
        ...run,
        stepId,
        at: at(seconds),
        tool,
        arguments: args,
        status: "ok",
        influenced: true,
        flagged: false,
        durationMs: 3,
        keys,
    };
}

// billing reads an invoice page, then pays the IBAN on it
export function invoiceRun(): RunEvent[] {
    const page = [IBAN_KEY, `url:${PAY_URL}`, `host:${PAY_HOST}`, `domain:${MAIN_DOMAIN}`, `id:${INVOICE_SHOWN}`];
    return [
        { type: "run_started", ...INVOICE, at: at(0), origins: {} },
        read(INVOICE, READ, 1, WEB, page),
        {
            type: "model_call",
            ...INVOICE,
            stepId: READ,
            at: at(2),
            model: "gpt-5.4-mini",
            toolCalls: [],
            status: "ok",
            durationMs: 500,
        },
        call(INVOICE, PAY, 3, "payInvoice", { iban: IBAN_MASK, memo: `Invoice ${INVOICE_ID}` }, [
            IBAN_KEY,
            `id:${INVOICE_SHOWN}`,
        ]),
        { type: "run_finished", ...INVOICE, at: at(4), status: "completed" },
    ];
}

// researcher fetches a page on the same main domain, then reads a file naming the pay host
export function docsRun(): RunEvent[] {
    const domain = `domain:${MAIN_DOMAIN}`;
    const page = [`url:${DOCS_URL}`, "host:docs.example.com", domain];
    return [
        { type: "run_started", ...DOCS, at: at(10), origins: {} },
        call(DOCS, FETCH, 11, "fetchPage", { url: DOCS_URL }, page),
        read(DOCS, FETCH, 12, WEB, page),
        call(DOCS, FILE, 13, "readFile", { path: PATH }, [PATH_KEY]),
        read(DOCS, FILE, 14, FILE_LABEL, ["host:docs.example.com", domain]),
        read(DOCS, LATER, 15, USER, [`host:${PAY_HOST}`, domain]),
        { type: "run_finished", ...DOCS, at: at(16), status: "blocked" },
    ];
}

// A run of an agent that only calls its model, named as the caller likes
export function agentRun(runId: string, agent: string): RunEvent[] {
    const run = { runId, agent };
    return [
        { type: "run_started", ...run, at: at(20), origins: {} },
        {
            type: "model_call",
            ...run,
            stepId: READ,
            at: at(21),
            model: "gpt-5.4",
            toolCalls: [],
            status: "ok",
            durationMs: 9,
        },
        { type: "run_finished", ...run, at: at(22), status: "completed" },
    ];
}

// One run that read the same path in many steps
export function manyReads(count: number): RunEvent[] {
    const steps = Array.from({ length: count }, (_, n) => (n + 1).toString(16).padStart(16, "a"));
    return [
        { type: "run_started", ...DOCS, at: at(0), origins: {} },
        ...steps.map((stepId, n) => read(DOCS, stepId, n + 1, FILE_LABEL, [PATH_KEY])),
    ];
}
