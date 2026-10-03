import type OpenAI from "openai";

export type Tools = Record<string, (input: never) => Promise<unknown>>;

type Item = Record<string, unknown>;

const TOOL_DEFS = ["fetchPage", "getSupplier", "payInvoice", "deleteFiles"].map((name) => ({
    type: "function" as const,
    name,
    parameters: { type: "object", properties: {} },
    strict: false,
}));

async function respond(client: OpenAI, input: Item[], stream: boolean): Promise<Item[]> {
    const request = { model: "test-model", input, tools: TOOL_DEFS, store: false } as never;
    if (!stream) {
        const response = (await client.responses.create(request)) as unknown as { output: Item[] };
        return response.output;
    }
    const events = (await client.responses.create({
        ...(request as object),
        stream: true,
    } as never)) as unknown as AsyncIterable<Item>;
    let output: Item[] = [];
    for await (const event of events) {
        if (event.type === "response.completed") {
            output = (event.response as { output: Item[] }).output;
        }
    }
    return output;
}

// A tiny agent loop: ask the model, run the tools it asks for, repeat
export async function runAgent(client: OpenAI, tools: Tools, prompt: string, stream = false) {
    const input: Item[] = [{ role: "user", content: prompt }];
    const results: Array<{ name: string; output: string }> = [];
    for (let turn = 0; turn < 5; turn++) {
        const output = await respond(client, input, stream);
        const calls = output.filter((item) => item.type === "function_call");
        if (calls.length === 0) {
            return { results, finalOutput: output };
        }
        input.push(...output);
        for (const call of calls) {
            const tool = tools[String(call.name)];
            const value = tool === undefined ? "unknown tool" : await tool(JSON.parse(String(call.arguments)) as never);
            const text = typeof value === "string" ? value : JSON.stringify(value);
            results.push({ name: String(call.name), output: text });
            input.push({ type: "function_call_output", call_id: call.call_id, output: text });
        }
    }
    throw new Error("agent did not finish");
}
