import { getHandoff, type Agent } from "@openai/agents";
import type { RunState } from "../../context/run.ts";
import { addFrameworkTools } from "../../monitor/framework-tools.ts";

// A tool from Agent.asTool() is a function tool with on()
function isAgentTool(tool: object): boolean {
    const item = tool as { type?: unknown; on?: unknown };
    return item.type === "function" && typeof item.on === "function";
}

// An agent's handoff tools and agent tools are the SDK's own, so the
// monitor does not warn that they are unwrapped
export function noteSdkTools(run: RunState, agent: Agent): void {
    const handoffs = agent.handoffs.map((item) => getHandoff(item).toolName);
    const agentTools = agent.tools.filter(isAgentTool).map((tool) => (tool as { name: string }).name);
    addFrameworkTools(run, [...handoffs, ...agentTools]);
}
