import type { StoredVerdict } from "@quard/db";
import { callIdsOf, happenedBy, readBy, type StoredLabel, type StoredRun } from "../rootcause/run.ts";

// The call id of the tool result that brought a label's content to its agent
function carrierOf(run: StoredRun, label: StoredLabel): string | null | undefined {
    const steps = run.steps.filter((step) => step.agent === label.agent);
    const own = steps.find((step) => step.stepId === label.stepId);
    if (own !== undefined) {
        return own.kind === "tool_call" ? own.callId : undefined;
    }
    // Content passed on keeps the step it first came from, so the agent's step just before it brought it
    const before = steps.filter(happenedBy(label.at)).at(-1);
    if (before?.kind === "tool_call") {
        return before.callId;
    }
    // A tool the SDK does not wrap has no step, only the call its model asked for
    const asked = before === undefined ? [] : callIdsOf(before);
    return asked.length === 1 ? asked[0] : undefined;
}

// Call ids of the tool results that may hold the suspect content, best first
export function suspectCallIds(verdict: StoredVerdict, run: StoredRun): string[] {
    const { entry, turning } = verdict;
    const key = entry.key;
    // The tool results that carried the traced value to the turning agent, latest first
    const carried = run.steps
        .filter((step) => step.stepId === turning.stepId)
        .flatMap((step) => run.labels.filter(readBy(step)))
        .filter((label) => label.agent === turning.agent && key !== null && label.keys.includes(key))
        .toReversed()
        .map((label) => carrierOf(run, label));
    // Then the tool call the suspect content came from
    const own = run.steps
        .filter((step) => step.stepId === entry.stepId && step.kind === "tool_call" && entry.contentId !== null)
        .map((step) => step.callId);
    return [...new Set([...carried, ...own])].filter((id): id is string => typeof id === "string");
}
