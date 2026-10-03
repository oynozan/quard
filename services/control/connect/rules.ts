import { closeConnection, saveAgentVersion, saveRules } from "@quard/db";
import type { ClientMessage } from "@quard/shared";
import type { Context } from "../server/context.ts";
import type { Connection } from "../socket/registry.ts";

type RulesMessage = Extract<ClientMessage, { type: "rules" }>;
type AgentMessage = Extract<ClientMessage, { type: "agent" }>;

// The SDK's active rules changed, for example after the policy file changed
export async function rules(ctx: Context, connection: Connection, message: RulesMessage): Promise<void> {
    await saveRules(ctx.db, connection.projectId, connection.id, message.rules);
}

// Instructions are redacted again here, so an old SDK never stores a raw value
export async function agent(ctx: Context, connection: Connection, message: AgentMessage): Promise<void> {
    const { instructions } = message;
    await saveAgentVersion(ctx.db, connection.projectId, {
        agent: message.agent,
        version: message.version,
        model: message.model,
        tools: message.tools,
        instructions: instructions === undefined ? undefined : ctx.redactor.text(instructions),
    });
}

// Nothing was stored for a connection that never said hello
export async function closed(ctx: Context, connection: Connection): Promise<void> {
    if (connection.id === "") {
        return;
    }
    try {
        await closeConnection(ctx.db, connection.projectId, connection.id);
    } catch (error) {
        ctx.log(`control: could not record a closed connection: ${(error as Error).message}`);
    }
}
