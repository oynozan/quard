import { now, record } from "../core/recorder.ts";
import { isGuardedTool, registerCall } from "../context/registry.ts";
import { mayUse, type Scope } from "../context/scope.ts";
import { parseJson } from "./json.ts";
import type { FunctionCall } from "./response.ts";

// Checks the tool calls a model asked for, before the app receives them.
// A call that fails stays in the response, marked blocked; its guard refuses it.
export function checkRequestedCalls(calls: readonly FunctionCall[], scope: Scope, stepId: string): void {
    for (const call of calls) {
        const allowed = mayUse(scope, call.name);
        registerCall({
            callId: call.callId,
            tool: call.name,
            args: parseJson(call.arguments) ?? call.arguments,
            scope,
            stepId,
            blocked: allowed ? undefined : { guard: "permission", reason: "permission_denied" },
        });
        const base = { runId: scope.run.runId, stepId, agent: scope.agent, at: now(), tool: call.name };
        record({
            type: "decision",
            ...base,
            guard: "permission",
            rule: "requested-call",
            decision: allowed ? "allow" : "block",
            mode: "block",
            enforced: true,
            reason: allowed ? undefined : "permission_denied",
        });
        if (!isGuardedTool(call.name)) {
            // An unwrapped tool can only be recorded, never stopped
            record({ type: "warning", ...base, code: "unwrapped_tool" });
        }
    }
}
