import { Agent } from "@openai/agents";
import { currentScope } from "../../context/scope.ts";
import { markFrameworkTool } from "../../monitor/framework-tools.ts";

type EnabledHandoffs = Agent["getEnabledHandoffs"];

let following = false;

// The Agents SDK writes a handoff's tool output itself. Each handoff it
// offers a model inside a Quard run is marked, so that output reads as
// system content, not as an unwrapped tool's.
export function followHandoffs(): void {
    if (following) {
        return;
    }
    following = true;
    const original = Agent.prototype.getEnabledHandoffs as EnabledHandoffs;
    const followed: EnabledHandoffs = async function (this: Agent, runContext) {
        const handoffs = await original.call(this, runContext);
        const scope = currentScope();
        if (scope !== undefined) {
            for (const handoff of handoffs) {
                markFrameworkTool(scope.run, handoff.toolName);
            }
        }
        return handoffs;
    };
    Agent.prototype.getEnabledHandoffs = followed;
}
