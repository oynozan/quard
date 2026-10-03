import { versionsOf } from "./versions";
import type { Agent, AgentState } from "../types";

// Who is working right now. Each agent's current version, model and tools come from its versions.
export const AGENT_STATES: Record<string, AgentState> = {
    orchestrator: "running",
    researcher: "running",
    billing: "running",
    support: "idle",
    "inbox-triage": "idle",
    "deploy-bot": "offline",
};

export const AGENTS: Agent[] = Object.entries(AGENT_STATES).map(([name, state]) => {
    const current = versionsOf(name)[0];
    return { name, version: current.version, model: current.model, tools: current.tools, state };
});

export function agentNames(): string[] {
    return AGENTS.map((agent) => agent.name);
}
