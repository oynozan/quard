import { AsyncLocalStorage } from "node:async_hooks";
import {
    tool,
    type FunctionTool,
    type ToolInputParameters,
    type ToolOptions,
    type ToolOutputSchema,
} from "@openai/agents";
import { GuardBlockedError, isGuardRefusal } from "../../core/refusal.ts";
import type { GuardOptions } from "../../guards/options.ts";
import { guardWithSignal } from "../../pipeline/guard.ts";
import { quardGuardrail } from "./guardrail.ts";
import { outputCheck } from "./output-schema.ts";

export type GuardedToolOptions<
    TParameters extends ToolInputParameters,
    Context,
    TOutputSchema extends ToolOutputSchema | undefined = undefined,
> = ToolOptions<TParameters, Context, TOutputSchema> & {
    // Each guard takes the tool's name, the name the model sees
    guard: GuardOptions | GuardOptions[];
};

type Execute = (input: unknown, context: unknown, details: unknown) => unknown;
type Extras = { context: unknown; details: unknown };

// The run context and call details of the call in progress. The guard
// checks the input only; the tool's own execute still gets them.
const extras = new AsyncLocalStorage<Extras>();

// The SDK aborts this signal when it gives up on the call: on the tool's
// timeout, when the app aborts the run, or when a sibling call fails
function signalOf(details: unknown): AbortSignal | undefined {
    const signal = (details as { signal?: unknown } | undefined)?.signal;
    return signal instanceof AbortSignal ? signal : undefined;
}

// Like the SDK's tool(), with every call run through guard()
export function guardedTool<
    TParameters extends ToolInputParameters = undefined,
    Context = unknown,
    TOutputSchema extends ToolOutputSchema | undefined = undefined,
>(options: GuardedToolOptions<TParameters, Context, TOutputSchema>): FunctionTool<Context, TParameters> {
    const { guard: guards, execute, outputGuardrails = [], outputSchema: _schema, ...rest } = options;
    const run = execute as Execute;
    const output = outputCheck(options, () => created.name);
    const created = tool({
        ...rest,
        ...(output.schema === undefined ? {} : { outputSchema: output.schema }),
        execute: async (input: unknown, context: unknown, details: unknown) => {
            try {
                const result = await extras.run({ context, details }, () => guarded(signalOf(details), [input]));
                return isGuardRefusal(result) ? result : output.check(result, context, details);
            } catch (error) {
                // Quard's guardrail stops the run with it
                if (error instanceof GuardBlockedError) {
                    return error;
                }
                throw error;
            }
        },
        // Quard's guardrail comes first, so later ones see what the model sees
        outputGuardrails: [quardGuardrail, ...outputGuardrails],
    } as unknown as ToolOptions<TParameters, Context>);
    // The guards take the name the SDK gave the tool
    const list = Array.isArray(guards) ? guards : [guards];
    const guarded = guardWithSignal(
        (input: unknown) => {
            const call = extras.getStore() as Extras;
            return run(input, call.context, call.details);
        },
        list.map((item) => ({ ...item, name: created.name })),
    );
    return created as FunctionTool<Context, TParameters>;
}
