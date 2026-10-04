import { readFileSync } from "node:fs";
import { z } from "zod";

export const TOOL_NAMES = ["readEmail", "fetchPage", "getSupplier", "getCustomers", "payInvoice", "sendEmail"] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

function text(field: string) {
    return z.string({ error: `${field} must be text` });
}

const scenarioSchema = z.object(
    {
        model: text("model").min(1, "model must not be empty"),
        // The system prompt
        instructions: text("instructions"),
        // What the user asks
        prompt: text("prompt").min(1, "prompt must not be empty"),
        // What readEmail returns
        email: text("email"),
        // What fetchPage returns for any URL
        page: text("page"),
        // The tools the model may call
        tools: z
            .array(z.enum(TOOL_NAMES, { error: `tools may only name ${TOOL_NAMES.join(", ")}` }), {
                error: "tools must be a list of tool names",
            })
            .min(1, "tools must name at least one tool"),
        // Run an AI detector on untrusted content
        detector: z.boolean({ error: "detector must be true or false" }),
    },
    { error: "the scenario must be a JSON object" },
);

export type Scenario = z.infer<typeof scenarioSchema>;

// Throws a plain message when the text is not a valid scenario
export function parseScenario(json: string): Scenario {
    let value: unknown;
    try {
        value = JSON.parse(json);
    } catch (error) {
        throw new Error(`scenario.json is not valid JSON: ${(error as Error).message}`, { cause: error });
    }
    const parsed = scenarioSchema.safeParse(value);
    if (!parsed.success) {
        const why = parsed.error.issues.map((issue) => issue.message).join("; ");
        throw new Error(`scenario.json is not valid: ${why}`);
    }
    return parsed.data;
}

export function readScenario(file: string): Scenario {
    return parseScenario(readFileSync(file, "utf8"));
}
