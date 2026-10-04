import type { Db } from "../../connect/connect.ts";

export type AgentMessageRecord = {
    stepId: string;
    kind: "message" | "handoff" | "tool";
    from: string;
    to: string;
    parentStepId: string | null;
    trust: "trusted" | "untrusted";
    sensitivity: "internal" | "public";
    verified: boolean;
    at: Date;
};

// A run's messages and handoffs between agents, oldest first. The finder reads them.
export async function getAgentMessages(db: Db, projectId: string, runId: string): Promise<AgentMessageRecord[]> {
    return db
        .selectFrom("agent_messages")
        .select([
            "step_id as stepId",
            "kind",
            "from_agent as from",
            "to_agent as to",
            "parent_step_id as parentStepId",
            "trust",
            "sensitivity",
            "verified",
            "at",
        ])
        .where("project_id", "=", projectId)
        .where("run_id", "=", runId)
        .orderBy("at")
        .orderBy("event_id")
        .execute();
}
