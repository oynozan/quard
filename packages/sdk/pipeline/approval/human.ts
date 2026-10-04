import { getConfig } from "../../core/config.ts";
import type { FailResult, GuardCall } from "../../guards/call.ts";
import { activeControl } from "../../transport/link/active.ts";
import { askApprover } from "./local.ts";
import { aborted, blocked, timeoutMs } from "./record.ts";
import { askControl } from "./remote.ts";

// Asks the approver set in code, else the dashboard through control. It
// stops waiting when the signal aborts.
export async function askHuman(
    call: GuardCall,
    asks: readonly FailResult[],
    timeout: number | undefined,
    signal?: AbortSignal,
): Promise<FailResult | "approved"> {
    const stopped = aborted(call, signal);
    if (stopped !== undefined) {
        return stopped;
    }
    const ms = timeoutMs(timeout);
    const approver = getConfig().approver;
    if (approver !== undefined) {
        return askApprover(call, approver, ms, signal);
    }
    const control = activeControl();
    return control === undefined
        ? blocked(call, "no-approver", "approval_unavailable")
        : askControl(control, call, asks, ms, signal);
}
