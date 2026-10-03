import {
    createRedactor,
    newEventId,
    parseHashKey,
    type AskMessage,
    type CountMessage,
    type FleetMessage,
    type FleetValue,
    type HelloMessage,
    type RulesSnapshot,
} from "@quard/shared";

export const REDACTOR = createRedactor(parseHashKey("ab".repeat(32)));
export const RUN = "1".repeat(32);
export const STEP = "2".repeat(16);
export const HASH = "c".repeat(32);
export const IBAN = "DE89370400440532013000";

export const RULES: RulesSnapshot = {
    hash: "d".repeat(16),
    list: [{ tool: "payInvoice", guard: "approval", rule: "approval", mode: "block" }],
};

export const IBAN_VALUE: FleetValue = { field: "iban", kind: "iban", key: `iban:GB33…5555#${"e".repeat(32)}` };
export const DOMAIN_VALUE: FleetValue = { field: "url", kind: "domain", key: "domain:evil.com" };

export function helloMessage(fields: Partial<HelloMessage> = {}): HelloMessage {
    return { type: "hello", sdk: "0.0.0", host: "box-1", pid: 4242, rules: RULES, ...fields };
}

// A payInvoice call that waits for a human
export function askMessage(fields: Partial<AskMessage> = {}): AskMessage {
    return {
        type: "ask",
        askId: newEventId(),
        runId: RUN,
        stepId: STEP,
        agent: "billing",
        tool: "payInvoice",
        argsHash: HASH,
        args: { iban: IBAN, amount: 4950, apiKey: "sk-live-1234567890abcdef" },
        labels: [
            {
                path: "iban",
                values: [
                    {
                        type: "iban",
                        origins: [
                            {
                                origin: "web:acme-billing.net",
                                trust: "untrusted",
                                sensitivity: "public",
                                flags: [],
                                stepId: STEP,
                                match: "exact",
                            },
                        ],
                        generated: false,
                    },
                ],
            },
        ],
        context: { trust: "untrusted", sensitivity: "public", origins: ["web:acme-billing.net"], flagged: false },
        reasons: [{ guard: "approval", rule: "approval", reason: "approval_required" }],
        rules: RULES.hash,
        ...fields,
    };
}

export function countMessage(fields: Partial<CountMessage> = {}): CountMessage {
    return {
        type: "count",
        id: newEventId(),
        tool: "payInvoice",
        counter: "calls",
        day: new Date().toISOString().slice(0, 10),
        add: 1,
        ...fields,
    };
}

// A use of `values` in run `n`
export function fleetMessage(n: number, values: FleetValue[], fields: Partial<FleetMessage> = {}): FleetMessage {
    return {
        type: "fleet",
        id: newEventId(),
        runId: n.toString(16).padStart(32, "0"),
        agent: "billing",
        tool: "payInvoice",
        blocked: false,
        values,
        ...fields,
    };
}
