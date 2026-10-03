import { z } from "zod";

// Messages between the SDK and control. Each process keeps one WebSocket
// to CONTROL_PATH, opened with "Authorization: Bearer <agent key>".

export const CONTROL_PATH = "/v1/connect";

// Close codes control uses besides the standard ones
export const CLOSE_CODES = { badHello: 4400, revoked: 4401 } as const;

const hex = (length: number) => z.string().regex(new RegExp(`^[0-9a-f]{${length}}$`));
// Ids the SDK makes up for its own requests
const id = hex(16);
const runId = hex(32);
const stepId = hex(16);
const name = z.string().min(1).max(200);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const at = z.iso.datetime();
const trust = z.enum(["trusted", "untrusted"]);
const sensitivity = z.enum(["internal", "public"]);

export const requestId = z.string().regex(/^apr_[0-9a-f]{16}$/);
export const grantId = z.string().regex(/^grt_[0-9a-f]{16}$/);
export const approvalAnswer = z.enum(["once", "always", "deny"]);

// One rule as the dashboard lists it
export const ruleEntry = z.object({ tool: name, guard: name, rule: name, mode: z.enum(["block", "observe"]) });
export const rulesSnapshot = z.object({ hash: hex(16), list: z.array(ruleEntry).max(5000) });

// Where one argument value came from. Raw values never go here.
const origin = z.object({
    origin: z.string().max(2000),
    trust,
    sensitivity,
    flags: z.array(z.string().max(100)).max(20),
    stepId,
    match: z.enum(["exact", "host", "domain"]),
});

export const argumentLabel = z.object({
    path: z.string().max(1000),
    values: z.array(z.object({ type: name, origins: z.array(origin).max(50), generated: z.boolean() })).max(50),
});

// A guard rule that asked for a human
export const askReason = z.object({
    guard: name,
    rule: name,
    reason: z.string().max(100),
    field: z.string().max(200).optional(),
});

// IBANs and emails arrive hashed with a mask; domains stay in clear
export const fleetValue = z
    .object({ field: name, kind: z.enum(["iban", "email", "domain"]), key: z.string().max(500) })
    .refine(
        (value) =>
            value.kind === "domain"
                ? /^domain:[a-z0-9.-]+$/.test(value.key)
                : new RegExp(`^${value.kind}:[^#\\s]+#[0-9a-f]{32}$`).test(value.key),
        "a fleet key must be hashed, or a plain domain",
    );

export const quarantineEntry = z.object({
    key: z.string(),
    // Quarantined while the fleet check was still in observe mode
    observe: z.boolean(),
});

// --- SDK to control ---

// The first message. Control answers with "ready".
export const helloMessage = z.object({
    type: z.literal("hello"),
    sdk: z.string().min(1).max(50),
    host: z.string().max(255),
    pid: z.number().int().nonnegative(),
    rules: rulesSnapshot,
});

// The active rules changed, for example after the policy file changed
export const rulesMessage = z.object({ type: z.literal("rules"), rules: rulesSnapshot });

// An agent version seen for the first time in this process
export const agentMessage = z.object({
    type: z.literal("agent"),
    agent: name,
    version: hex(16),
    model: z.string().max(200),
    tools: z.array(name).max(500),
    instructions: z.string().max(100_000).optional(),
});

// A call that needs a human. Sent again with requestId after a reconnect.
export const askMessage = z.object({
    type: z.literal("ask"),
    askId: id,
    requestId: requestId.optional(),
    runId,
    stepId,
    agent: name,
    tool: name,
    // Keyed hash of the canonical arguments, secrets included
    argsHash: hex(32),
    // Full values with secrets removed, for the approver
    args: z.unknown(),
    labels: z.array(argumentLabel).max(500),
    context: z.object({ trust, sensitivity, origins: z.array(z.string().max(2000)).max(200), flagged: z.boolean() }),
    reasons: z.array(askReason).min(1).max(50),
    rules: hex(16).optional(),
});

// Sent every BEAT_MS for the calls still waiting
export const beatMessage = z.object({ type: z.literal("beat"), askIds: z.array(id).max(10_000) });

// The call stopped waiting, for example after its timeout
export const cancelMessage = z.object({ type: z.literal("cancel"), askId: id });

// Adds to a per-day counter. With max, control only adds when the
// total stays at or under it; without max it always adds.
export const countMessage = z.object({
    type: z.literal("count"),
    id,
    tool: name,
    counter: z
        .string()
        .regex(/^(calls|amount:.+)$/)
        .max(200),
    day,
    add: z.number().finite().nonnegative(),
    max: z.number().finite().nonnegative().optional(),
});

// A call used watched values. Blocked attempts are sent too.
export const fleetMessage = z.object({
    type: z.literal("fleet"),
    id,
    runId,
    agent: name,
    tool: name,
    blocked: z.boolean(),
    values: z.array(fleetValue).min(1).max(100),
});

export const clientMessage = z.discriminatedUnion("type", [
    helloMessage,
    rulesMessage,
    agentMessage,
    askMessage,
    beatMessage,
    cancelMessage,
    countMessage,
    fleetMessage,
]);

// --- control to SDK ---

export const readyMessage = z.object({
    type: z.literal("ready"),
    at,
    quarantine: z.array(quarantineEntry),
    fleetObserveUntil: at.nullable(),
    // Today's per-day counts in the project, by UTC day
    counters: z.array(z.object({ tool: name, counter: z.string(), day, used: z.number() })),
});

export const askedMessage = z.object({ type: z.literal("asked"), askId: id, requestId });

export const decidedMessage = z.object({
    type: z.literal("decided"),
    askId: id,
    answer: approvalAnswer,
    requestId: requestId.optional(),
    // Set when an "always approve" grant answered at once
    grantId: grantId.optional(),
});

export const countedMessage = z.object({ type: z.literal("counted"), id, ok: z.boolean(), used: z.number() });

export const fleetResultMessage = z.object({
    type: z.literal("fleet_result"),
    id,
    // The values of this call that are quarantined now
    quarantined: z.array(quarantineEntry),
    fleetObserveUntil: at.nullable(),
});

// Pushed when the quarantine list changes
export const quarantineMessage = z.object({
    type: z.literal("quarantine"),
    add: z.array(quarantineEntry),
    remove: z.array(z.string()),
});

export const errorMessage = z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
    // The request it answers, when there is one
    id: z.string().optional(),
});

export const serverMessage = z.discriminatedUnion("type", [
    readyMessage,
    askedMessage,
    decidedMessage,
    countedMessage,
    fleetResultMessage,
    quarantineMessage,
    errorMessage,
]);

export type ApprovalAnswer = z.infer<typeof approvalAnswer>;
export type RuleEntry = z.infer<typeof ruleEntry>;
export type RulesSnapshot = z.infer<typeof rulesSnapshot>;
export type ArgumentLabelMessage = z.infer<typeof argumentLabel>;
export type AskReason = z.infer<typeof askReason>;
export type FleetValue = z.infer<typeof fleetValue>;
export type QuarantineEntry = z.infer<typeof quarantineEntry>;
export type ClientMessage = z.infer<typeof clientMessage>;
export type ServerMessage = z.infer<typeof serverMessage>;
export type HelloMessage = z.infer<typeof helloMessage>;
export type AskMessage = z.infer<typeof askMessage>;
export type CountMessage = z.infer<typeof countMessage>;
export type FleetMessage = z.infer<typeof fleetMessage>;
export type ReadyMessage = z.infer<typeof readyMessage>;
export type DecidedMessage = z.infer<typeof decidedMessage>;
