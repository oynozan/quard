import type { FailResult, GuardCall } from "../../guards/call.ts";
import { rulesHash } from "../../policy/rules.ts";
import { flushUploads } from "../../transport/configure.ts";
import type { Control } from "../../transport/link/control.ts";
import { askFor } from "./message.ts";
import { approved, blocked } from "./record.ts";

// Asks in the dashboard, through control, and waits for the answer
export async function askControl(
    control: Control,
    call: GuardCall,
    asks: readonly FailResult[],
    ms: number | undefined,
    signal?: AbortSignal,
): Promise<FailResult | "approved"> {
    const message = askFor(call, asks, control.hashKey, rulesHash());
    if (typeof message === "string") {
        return blocked(call, message, "approval_unavailable");
    }
    const waiting = control.approvals.ask(message, ms, signal);
    // The approver then finds the run in the dashboard
    void flushUploads();
    const answer = await waiting;
    if (answer.kind === "down") {
        return blocked(call, "backend-down", "backend_unavailable");
    }
    if (answer.kind === "timeout" || answer.kind === "aborted") {
        return blocked(call, answer.kind, "approval_timed_out", answer.requestId);
    }
    if (answer.answer === "deny") {
        return blocked(call, "human", "approval_denied", answer.requestId);
    }
    return approved(call, answer.grantId === undefined ? "human" : "always-approved", answer.requestId);
}
