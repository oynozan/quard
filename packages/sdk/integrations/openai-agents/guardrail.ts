import { defineToolOutputGuardrail, ToolGuardrailFunctionOutputFactory } from "@openai/agents";
import { GuardBlockedError, isGuardRefusal } from "../../core/refusal.ts";

// Turns a guard's block into the SDK's tool guardrail behavior. A refusal
// becomes a rejection the model reads, with Quard's own text. A guard set
// to onBlock: "throw" stops the run.
export const quardGuardrail = defineToolOutputGuardrail({
    name: "quard",
    run: async ({ output }) => {
        if (output instanceof GuardBlockedError) {
            throw output;
        }
        if (isGuardRefusal(output)) {
            return ToolGuardrailFunctionOutputFactory.rejectContent(output.text, output.toJSON());
        }
        return ToolGuardrailFunctionOutputFactory.allow();
    },
});
