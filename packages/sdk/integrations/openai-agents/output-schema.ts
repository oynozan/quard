import { InvalidToolOutputError, tool, type RunContext } from "@openai/agents";

type Parse = (output: unknown) => unknown;

// The SDK checks a zod output schema inside the call, before any
// guardrail, so a refusal would fail it. The SDK gets the JSON schema
// instead, which it only shows the model, and real results are checked here.
export type OutputCheck = {
    // What tool() gets as outputSchema
    schema: unknown;
    check(output: unknown, context: unknown, details: unknown): unknown;
};

const asIs = (output: unknown) => output;

export function outputCheck(options: { outputSchema?: unknown }, name: () => string): OutputCheck {
    const given = options.outputSchema;
    if (given === undefined) {
        return { schema: undefined, check: asIs };
    }
    // The same tool, made only to read the JSON schema
    const shown = (tool(options as never) as { outputSchema?: unknown }).outputSchema;
    if (shown === given) {
        return { schema: given, check: asIs };
    }
    const parse: Parse = (given as { parse: Parse }).parse.bind(given);
    return {
        schema: shown,
        check: (output, context, details) => {
            try {
                return parse(output);
            } catch (error) {
                const where = { runContext: context as RunContext, output, details: details as never };
                throw new InvalidToolOutputError(
                    `Invalid output for function tool '${name()}'.`,
                    undefined,
                    error,
                    where,
                );
            }
        },
    };
}
