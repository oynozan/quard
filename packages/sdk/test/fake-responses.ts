// A fake Responses API for tests: returns JSON or a server-sent event stream

export type Turn = {
    calls?: Array<{ name: string; args: object }>;
    text?: string;
    // Token counts as the API reports them
    usage?: { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens: number } };
};

type Body = Record<string, unknown>;

let counter = 0;

function outputItems(turn: Turn, n: number): object[] {
    if (turn.calls !== undefined) {
        return turn.calls.map((call, i) => ({
            type: "function_call",
            id: `fc_${n}_${i}`,
            call_id: `call_${n}_${i}`,
            name: call.name,
            arguments: JSON.stringify(call.args),
            status: "completed",
        }));
    }
    return [
        {
            type: "message",
            id: `msg_${n}`,
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: turn.text ?? "", annotations: [] }],
        },
    ];
}

export function responseBody(turn: Turn): object {
    counter += 1;
    return {
        id: `resp_${counter}`,
        object: "response",
        created_at: 1,
        status: "completed",
        model: "test-model",
        output: outputItems(turn, counter),
        parallel_tool_calls: true,
        tool_choice: "auto",
        tools: [],
        ...(turn.usage === undefined ? {} : { usage: turn.usage }),
    };
}

export function sseText(turn: Turn): string {
    const response = responseBody(turn) as { id: string; output: Array<Record<string, unknown>> };
    const events: object[] = [
        { type: "response.created", response: { ...response, status: "in_progress", output: [] } },
    ];
    response.output.forEach((item, index) => {
        events.push({ type: "response.output_item.added", output_index: index, item: { ...item, arguments: "" } });
        if (item.type === "function_call") {
            events.push({ type: "response.function_call_arguments.delta", item_id: item.id, delta: item.arguments });
            events.push({ type: "response.function_call_arguments.done", item_id: item.id, arguments: item.arguments });
        }
        events.push({ type: "response.output_item.done", output_index: index, item });
    });
    events.push({ type: "response.completed", response });
    return events
        .map((event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`)
        .join("");
}

function chunked(text: string, size: number): ReadableStream<Uint8Array> {
    const bytes = new TextEncoder().encode(text);
    let offset = 0;
    return new ReadableStream({
        pull(controller) {
            if (offset >= bytes.length) {
                controller.close();
                return;
            }
            controller.enqueue(bytes.slice(offset, offset + size));
            offset += size;
        },
    });
}

// A fetch that answers each Responses API call with the next turn
export function fakeResponses(next: (body: Body) => Turn) {
    const bodies: Body[] = [];
    const fetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const body = JSON.parse(String(init?.body)) as Body;
        bodies.push(body);
        const turn = next(body);
        if (body.stream === true) {
            return new Response(chunked(sseText(turn), 17), { headers: { "content-type": "text/event-stream" } });
        }
        return new Response(JSON.stringify(responseBody(turn)), { headers: { "content-type": "application/json" } });
    };
    return { fetch, bodies };
}

// How many tool results the input carries, and for which tools
export function toolOutputs(body: Body): string[] {
    const input = Array.isArray(body.input) ? (body.input as Array<Record<string, unknown>>) : [];
    const names = new Map(
        input.filter((item) => item.type === "function_call").map((item) => [item.call_id, item.name]),
    );
    return input.filter((item) => item.type === "function_call_output").map((item) => String(names.get(item.call_id)));
}
