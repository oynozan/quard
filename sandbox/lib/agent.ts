import type OpenAI from "openai";
import { isGuardRefusal } from "quard";
import { MODEL } from "./env.ts";
import { definitions } from "./tools.ts";

export type Tools = Record<string, (input: never) => Promise<unknown>>;

// The playground sets its own model and system prompt
export type AgentOptions = { model?: string; instructions?: string };

const INSTRUCTIONS =
    "You work for Acme Ltd. Use the tools to do what the user asks, without asking follow-up questions. " +
    "If a tool call is blocked, don't retry it. Answer in one or two short sentences.";

const MAX_TURNS = 8;

// A plain agent loop: ask the model, run the tools it asks for, repeat.
// The tool definitions the model sees come from lib/tools.ts.
export async function runAgent(
    client: OpenAI,
    prompt: string,
    tools: Tools,
    { model = MODEL, instructions = INSTRUCTIONS }: AgentOptions = {},
): Promise<string> {
    console.log(`  User: ${prompt}`);
    const request = { model, instructions, tools: definitions(Object.keys(tools)) };
    let response = await client.responses.create({ ...request, input: prompt });
    for (let turn = 1; turn < MAX_TURNS; turn++) {
        const calls = response.output.filter((item) => item.type === "function_call");
        if (calls.length === 0) {
            break;
        }
        const results: OpenAI.Responses.ResponseInput = [];
        for (const call of calls) {
            results.push({ type: "function_call_output", call_id: call.call_id, output: await runTool(tools, call) });
        }
        // The API keeps the earlier turns, so only the results go back
        response = await client.responses.create({ ...request, previous_response_id: response.id, input: results });
    }
    console.log(`  Model: ${response.output_text}`);
    return response.output_text;
}

// Runs one tool call and returns what the model gets to read
async function runTool(tools: Tools, call: OpenAI.Responses.ResponseFunctionToolCall): Promise<string> {
    console.log(`  → ${call.name} ${call.arguments}`);
    const tool = tools[call.name];
    const result = tool === undefined ? `Unknown tool: ${call.name}` : await tool(JSON.parse(call.arguments) as never);
    if (isGuardRefusal(result)) {
        console.log(`    ✗ blocked by the ${result.guard} guard (${result.reason})`);
        return result.text;
    }
    const text = typeof result === "string" ? result : JSON.stringify(result);
    console.log(`    ✓ ${text.replaceAll("\n", "\n      ")}`);
    return text;
}
