import { AsyncLocalStorage } from "node:async_hooks";
import { tool, type FunctionTool, type ToolInputParameters, type ToolOptions } from "@openai/agents";
import { GuardBlockedError } from "../../core/refusal.ts";
import type { GuardOptions } from "../../guards/options.ts";
import { guard } from "../../pipeline/guard.ts";
import { quardGuardrail } from "./guardrail.ts";

export type GuardedToolOptions<TParameters extends ToolInputParameters, Context> = ToolOptions<TParameters, Context> & {
    // Each guard takes the tool's name, the name the model sees
    guard: GuardOptions | GuardOptions[];
};

type Execute = (input: unknown, context: unknown, details: unknown) => unknown;
type Extras = { context: unknown; details: unknown };

// The run context and call details of the call in progress. The guard
// checks the input only; the tool's own execute still gets them.
const extras = new AsyncLocalStorage<Extras>();

// Like the SDK's tool(), with every call run through guard()
export function guardedTool<TParameters extends ToolInputParameters = undefined, Context = unknown>(
    options: GuardedToolOptions<TParameters, Context>,
): FunctionTool<Context, TParameters> {
    const { guard: guards, execute, outputGuardrails = [], ...rest } = options;
    const run = execute as Execute;
    const created = tool({
        ...rest,
        execute: async (input: unknown, context: unknown, details: unknown) => {
            try {
                return await extras.run({ context, details }, () => guarded(input));
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
    const guarded = guard(
        (input: unknown) => {
            const call = extras.getStore() as Extras;
            return run(input, call.context, call.details);
        },
        list.map((item) => ({ ...item, name: created.name })),
    );
    return created as FunctionTool<Context, TParameters>;
}
