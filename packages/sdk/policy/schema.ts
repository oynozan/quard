import { z } from "zod";
import type { Detector } from "../detectors/detector.ts";

// The options a JSON policy file can hold. They mirror guards/options.ts,
// without the parts that are functions in code.
const name = z.string().min(1).optional();
const mode = z.enum(["block", "observe"]).optional();
const onBlock = z.enum(["return", "throw"]).optional();
const onFail = z.enum(["block", "ask"]).optional();
const field = z.string().min(1);
const hosts = z.array(z.string().min(1)).optional();
const dataAction = z.enum(["allow", "mask", "block"]).optional();

const source = z.strictObject({
    type: z.literal("source"),
    name,
    mode,
    onBlock,
    origin: z.string().min(1),
    blockDomains: hosts,
    allowDomains: hosts,
    onSuspect: z.enum(["flag", "strip", "block"]).optional(),
});

const fromRule = z.strictObject({ field, from: z.array(z.string().min(1)).min(1), onFail, name });
const maxRule = z.strictObject({ field, max: z.number(), onFail, name });
const neverSeenRule = z.strictObject({ field, neverSeen: z.literal(true), onFail, name });

const action = z.strictObject({
    type: z.literal("action"),
    name,
    mode,
    onBlock,
    rules: z.array(z.union([fromRule, maxRule, neverSeenRule])).min(1),
});

const approval = z.strictObject({
    type: z.literal("approval"),
    name,
    onBlock,
    // Seconds to wait for an answer
    timeout: z.number().positive().optional(),
});

const egress = z.strictObject({
    type: z.literal("egress"),
    name,
    mode,
    onBlock,
    allow: hosts,
    onFail,
    payload: z.strictObject({ secrets: dataAction, cards: dataAction, ibans: dataAction }).optional(),
});

const limit = z.strictObject({
    type: z.literal("limit"),
    name,
    mode,
    onBlock,
    maxCallsPerRun: z.number().int().nonnegative().optional(),
    maxAmountPerRun: z.strictObject({ field, max: z.number().nonnegative() }).optional(),
    maxCallsPerDay: z.number().int().nonnegative().optional(),
    maxAmountPerDay: z.strictObject({ field, max: z.number().nonnegative() }).optional(),
    fleetCheck: z.array(field).min(1).optional(),
});

export const guardOptionsJson = z.discriminatedUnion("type", [source, action, approval, egress, limit]);

export const signaturesConfig = z
    .strictObject({
        file: z.string().min(1).optional(),
        url: z
            .url()
            .refine((url) => /^https?:/i.test(url), "use an http or https URL")
            .optional(),
        refreshSeconds: z.number().int().min(1).optional(),
        mode: z.enum(["block", "observe"]).optional(),
    })
    .refine((config) => (config.file === undefined) !== (config.url === undefined), "set exactly one of file or url");

const unit = z.number().min(0).max(1);

export const detectorRules = z.strictObject({
    mode: z.enum(["observe", "enforce"]).optional(),
    flagAt: unit.optional(),
    stripAt: unit.optional(),
});

export const policySchema = z.strictObject({
    $schema: z.string().optional(),
    version: z.union([z.string().min(1), z.number()]),
    strictness: z.enum(["lenient", "balanced", "strict"]).optional(),
    origins: z
        .record(
            z.string(),
            z.strictObject({
                trust: z.enum(["trusted", "untrusted"]).optional(),
                sensitivity: z.enum(["internal", "public"]).optional(),
            }),
        )
        .optional(),
    // file, url and refreshSeconds are read at startup; mode applies live
    signatures: signaturesConfig.optional(),
    detector: detectorRules.optional(),
    // Tool name to its guard options. A tool listed here ignores its code options.
    guards: z.record(z.string().min(1), z.array(guardOptionsJson)).optional(),
});

// The quard.configure() options this module adds
export const configureExtras = z.object({
    policyFile: z.string().min(1).optional(),
    signatures: signaturesConfig.optional(),
    detector: z
        .custom<Detector>(
            (value) =>
                typeof value === "object" &&
                value !== null &&
                typeof (value as Detector).name === "string" &&
                typeof (value as Detector).label === "function",
            "a detector needs a name and a label() function",
        )
        .optional(),
    detectorRules: detectorRules.optional(),
});

export type PolicyFile = z.infer<typeof policySchema>;
export type SignaturesConfig = z.infer<typeof signaturesConfig>;

export function parsePolicy(text: string): PolicyFile {
    return policySchema.parse(JSON.parse(text));
}
