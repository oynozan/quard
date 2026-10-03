import { costOf, type RunEvent, type UploadItem } from "@quard/shared";
import type { Insertable } from "kysely";
import type { DecisionsTable, EventsTable, LabelsTable, RunsTable, StepsTable } from "../../schema/database.ts";

// An event that belongs to a run. Config errors from a policy file or a
// signature feed belong to none, so they are not stored with runs.
export type RunItem = UploadItem & { event: Extract<RunEvent, { runId: string }> };

export function isRunItem(item: UploadItem): item is RunItem {
    return "runId" in item.event;
}

type Span = { agent: string; start: number; end: number; degraded: boolean };

// One row per run in the batch: its time span and first agent.
// The agent and origins from run_started are set separately.
export function runRows(projectId: string, items: RunItem[]): Insertable<RunsTable>[] {
    const spans = new Map<string, Span>();
    for (const { event, degraded } of items) {
        const at = Date.parse(event.at);
        const span = spans.get(event.runId) ?? { agent: event.agent, start: at, end: at, degraded: false };
        span.start = Math.min(span.start, at);
        span.end = Math.max(span.end, at);
        span.degraded ||= degraded === true;
        spans.set(event.runId, span);
    }
    return [...spans].map(([runId, span]) => ({
        project_id: projectId,
        run_id: runId,
        agent: span.agent,
        started_at: new Date(span.start),
        last_event_at: new Date(span.end),
        degraded: span.degraded,
    }));
}

export function eventRows(projectId: string, items: RunItem[]): Insertable<EventsTable>[] {
    return items.map(({ id, degraded, event }) => ({
        project_id: projectId,
        event_id: id,
        run_id: event.runId,
        step_id: "stepId" in event ? event.stepId : null,
        type: event.type,
        agent: event.agent,
        at: event.at,
        degraded: degraded === true,
        body: JSON.stringify(event),
    }));
}

export function stepRows(projectId: string, items: RunItem[]): Insertable<StepsTable>[] {
    return items.flatMap(({ event }): Insertable<StepsTable>[] => {
        if (event.type === "model_call") {
            return [
                {
                    project_id: projectId,
                    run_id: event.runId,
                    step_id: event.stepId,
                    kind: "model_call",
                    agent: event.agent,
                    parent_step_id: event.parentStepId ?? null,
                    name: event.model,
                    call_id: null,
                    status: event.status,
                    at: event.at,
                    duration_ms: Math.round(event.durationMs),
                    detail: JSON.stringify({
                        responseId: event.responseId,
                        toolCalls: event.toolCalls,
                        usage: event.usage ?? null,
                        // Priced when stored, so a later price change leaves past runs alone
                        costUsd: event.usage === undefined ? null : costOf(event.model, event.usage),
                        // Left out when the SDK sent none
                        agentVersion: event.agentVersion,
                    }),
                },
            ];
        }
        if (event.type === "tool_call") {
            return [
                {
                    project_id: projectId,
                    run_id: event.runId,
                    step_id: event.stepId,
                    kind: "tool_call",
                    agent: event.agent,
                    parent_step_id: null,
                    name: event.tool,
                    call_id: event.callId ?? null,
                    status: event.status,
                    influenced: event.influenced,
                    flagged: event.flagged,
                    at: event.at,
                    duration_ms: Math.round(event.durationMs),
                    detail: JSON.stringify({ arguments: event.arguments, error: event.error, keys: event.keys ?? [] }),
                },
            ];
        }
        return [];
    });
}

export function labelRows(projectId: string, items: RunItem[]): Insertable<LabelsTable>[] {
    return items.flatMap(({ event }): Insertable<LabelsTable>[] =>
        event.type === "content"
            ? [
                  {
                      project_id: projectId,
                      run_id: event.runId,
                      content_id: event.contentId,
                      step_id: event.stepId,
                      agent: event.agent,
                      origin: event.origin,
                      trust: event.trust,
                      sensitivity: event.sensitivity,
                      flags: event.flags,
                      keys: event.keys,
                      at: event.at,
                  },
              ]
            : [],
    );
}

export function decisionRows(projectId: string, items: RunItem[]): Insertable<DecisionsTable>[] {
    return items.flatMap(({ id, event }): Insertable<DecisionsTable>[] =>
        event.type === "decision"
            ? [
                  {
                      project_id: projectId,
                      event_id: id,
                      run_id: event.runId,
                      step_id: event.stepId,
                      agent: event.agent,
                      tool: event.tool,
                      guard: event.guard,
                      rule: event.rule,
                      decision: event.decision,
                      mode: event.mode,
                      enforced: event.enforced,
                      reason: event.reason ?? null,
                      field: event.field ?? null,
                      at: event.at,
                      rules_hash: event.rules ?? null,
                      request_id: event.request ?? null,
                  },
              ]
            : [],
    );
}
