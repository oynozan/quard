import { cleanForMatch } from "./clean.ts";
import { z } from "zod";

export const SIGNATURE_CATEGORIES = [
    "code-execution",
    "unsafe-deserialization",
    "supply-chain",
    "ssrf",
    "path-traversal",
    "prompt-injection",
    "other",
] as const;

const literal = z
    .string()
    .min(1)
    .max(200)
    .refine((s) => cleanForMatch(s).length > 0, "must contain visible text");
const literals = z.array(literal).max(50);

export const signatureSchema = z
    .strictObject({
        id: z.string().regex(/^[A-Z0-9-]{3,40}$/, "use 3 to 40 capital letters, digits or dashes"),
        title: z.string().min(1).max(120),
        category: z.enum(SIGNATURE_CATEGORIES),
        where: z.array(z.enum(["input", "content"])).min(1),
        // Only check calls to these guards. All guards when left out.
        tools: z.array(z.string()).optional(),
        all: literals.optional(),
        any: literals.optional(),
        none: literals.optional(),
        action: z.enum(["block", "flag"]),
        source: z.url().optional(),
    })
    .refine((s) => (s.all?.length ?? 0) + (s.any?.length ?? 0) > 0, "needs at least one 'all' or 'any' string");

export const feedSchema = z
    .strictObject({
        $schema: z.string().optional(),
        version: z.string().min(1),
        signatures: z.array(signatureSchema).max(1000),
    })
    .refine((feed) => new Set(feed.signatures.map((s) => s.id)).size === feed.signatures.length, {
        message: "signature ids must be unique",
        path: ["signatures"],
    });

export type Signature = z.infer<typeof signatureSchema>;
export type Feed = z.infer<typeof feedSchema>;
