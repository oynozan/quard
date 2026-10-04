import type { HandoffEvent, MemoryEvent, MessageEvent } from "@quard/shared";
import type { Db } from "../../connect/connect.ts";

type Base = { eventId: string; stepId: string; agent: string; at: Date };
type Label = Pick<MessageEvent, "trust" | "sensitivity">;

// A message the agent took in. stepId is the receive call.
export type RunMessage = Base &
    Label & {
        type: "message";
        // "unknown" when no record vouched for the message
        from: string;
        // The sender's step, from the carrier
        parentStepId: string | null;
        labelRef: string | null;
        verified: boolean;
    };

// Work moved from the agent to another one
export type RunHandoff = Base & Label & { type: "handoff"; to: string; via: HandoffEvent["via"] };

// A read or write through quard.memory()
export type RunMemory = Base &
    Label & {
        type: "memory";
        store: string;
        op: MemoryEvent["op"];
        items: number;
        // Items whose stored labels matched their content
        verified: number;
    };

export type RunAgentEvent = RunMessage | RunHandoff | RunMemory;

type Body = MessageEvent | HandoffEvent | MemoryEvent;

// Ingest checked each body against the event schema before storing it
function eventOf(base: Base, body: Body): RunAgentEvent {
    const label = { trust: body.trust, sensitivity: body.sensitivity };
    switch (body.type) {
        case "message":
            return {
                ...base,
                ...label,
                type: "message",
                from: body.from,
                parentStepId: body.parentStepId ?? null,
                labelRef: body.labelRef ?? null,
                verified: body.verified,
            };
        case "handoff":
            return { ...base, ...label, type: "handoff", to: body.to, via: body.via };
        case "memory":
            return {
                ...base,
                ...label,
                type: "memory",
                store: body.store,
                op: body.op,
                items: body.items,
                verified: body.verified,
            };
    }
}

// A run's messages, handoffs and memory reads and writes, oldest first
export async function runAgentEvents(db: Db, projectId: string, runId: string): Promise<RunAgentEvent[]> {
    const rows = await db
        .selectFrom("events")
        .select(["event_id as eventId", "step_id as stepId", "agent", "at", "body"])
        .where("project_id", "=", projectId)
        .where("run_id", "=", runId)
        .where("type", "in", ["message", "handoff", "memory"])
        .orderBy("at")
        .orderBy("event_id")
        .execute();
    return rows.map(({ body, ...row }) => eventOf({ ...row, stepId: row.stepId as string }, body as Body));
}
