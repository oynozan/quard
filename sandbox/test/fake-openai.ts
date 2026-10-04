import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

// What the fake model answers to one request: tool calls, a text or an error
export type Turn = { calls?: Array<{ name: string; args: object }>; text?: string; error?: string };

export type Body = Record<string, unknown>;

let counter = 0;

function outputItems(turn: Turn): object[] {
    counter += 1;
    if (turn.calls !== undefined) {
        return turn.calls.map((call, i) => ({
            type: "function_call",
            id: `fc_${counter}_${i}`,
            call_id: `call_${counter}_${i}`,
            name: call.name,
            arguments: JSON.stringify(call.args),
            status: "completed",
        }));
    }
    const content = [{ type: "output_text", text: turn.text ?? "", annotations: [] }];
    return [{ type: "message", id: `msg_${counter}`, status: "completed", role: "assistant", content }];
}

function responseBody(turn: Turn): object {
    return {
        id: `resp_${counter + 1}`,
        object: "response",
        created_at: 1,
        status: "completed",
        model: "test-model",
        output: outputItems(turn),
        parallel_tool_calls: true,
        tool_choice: "auto",
        tools: [],
        usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 0 } },
    };
}

// A fake Responses API on a local port. Agent requests get the next
// scripted turn, then "Done."; detector requests, which have no tools,
// get the detector score as text.
export async function startFakeOpenAI() {
    const bodies: Body[] = [];
    let turns: Turn[] = [];
    let score = "0";
    const server = createServer(async (request, response) => {
        let text = "";
        for await (const chunk of request) {
            text += String(chunk);
        }
        const body = JSON.parse(text) as Body;
        bodies.push(body);
        const turn = body.tools === undefined ? { text: score } : (turns.shift() ?? { text: "Done." });
        if (turn.error !== undefined) {
            const error = { error: { message: turn.error, type: "invalid_request_error" } };
            response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify(error));
            return;
        }
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(responseBody(turn)));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return {
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
        bodies,
        // The model's turns for the next run, and the detector's score
        script(next: Turn[], detectorScore = "0"): void {
            turns = [...next];
            score = detectorScore;
            bodies.length = 0;
        },
        close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
}

// The tool results the agent sent back, in order
export function toolOutputs(bodies: Body[]): string[] {
    return bodies.flatMap((body) =>
        Array.isArray(body.input)
            ? (body.input as Body[])
                  .filter((item) => item.type === "function_call_output")
                  .map((item) => String(item.output))
            : [],
    );
}
