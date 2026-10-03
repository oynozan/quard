import { Agent, type AgentOptions } from "@openai/agents";
import type { ModelCallEvent, RunEvent } from "@quard/shared";
import OpenAI from "openai";
import { fakeResponses, type Turn } from "./fake-responses.ts";

// A fake Responses API that answers each agent from its own script, so no
// test needs a network. Test agents use their name as their instructions,
// which tells the fake who is asking.
export function scriptedClient(scripts: Record<string, Turn[]>) {
    const fake = fakeResponses((body) => {
        const agent = String(body.instructions);
        const turn = scripts[agent]?.shift();
        if (turn === undefined) {
            throw new Error(`No turn left for ${agent}`);
        }
        return turn;
    });
    // A failed fake call fails the test at once instead of being retried
    const client = new OpenAI({ apiKey: "test", fetch: fake.fetch, maxRetries: 0 });
    return { client, bodies: fake.bodies };
}

export function testAgent(name: string, options: Partial<AgentOptions> = {}): Agent {
    return new Agent({ name, instructions: name, model: "test-model", ...options });
}

export function modelCalls(events: readonly RunEvent[]): ModelCallEvent[] {
    return events.filter((event): event is ModelCallEvent => event.type === "model_call");
}

// The text of each tool result in a request, by tool name
export function toolResults(body: Record<string, unknown>): Record<string, string> {
    const input = body.input as Array<Record<string, unknown>>;
    const names = new Map(
        input.filter((item) => item.type === "function_call").map((item) => [item.call_id, item.name]),
    );
    return Object.fromEntries(
        input
            .filter((item) => item.type === "function_call_output")
            .map((item) => [String(names.get(item.call_id)), String(item.output)]),
    );
}
