import type { FailResult, GuardCall } from "../guards/call.ts";
import { recordDecision } from "./checks.ts";

// A call whose caller gave up, such as on the SDK's tool timeout, never
// runs. It is not an approval that timed out: the tool may have none.
export function callAborted(call: GuardCall, signal: AbortSignal | undefined): FailResult | undefined {
    if (signal?.aborted !== true) {
        return undefined;
    }
    const result: FailResult = {
        guard: "abort",
        rule: "aborted",
        decision: "block",
        mode: "block",
        reason: "call_aborted",
    };
    recordDecision(call, result);
    return result;
}
