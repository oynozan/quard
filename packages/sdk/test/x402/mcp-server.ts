import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { paidOption, type PaymentRequired } from "@quard/shared";
import { stubFacilitator, v2Options } from "./facilitator.ts";

const text = (value: string) => [{ type: "text" as const, text: value }];

function price(tool: string, error?: string): PaymentRequired {
    return { x402Version: 2, resource: { url: `mcp://tool/${tool}` }, accepts: v2Options, ...(error ? { error } : {}) };
}

// The price as an error result. "text-priced" sends it only as text.
function priceResult(tool: string, error?: string) {
    const required = price(tool, error);
    const structured = tool === "text-priced" ? {} : { structuredContent: required };
    return { ...structured, content: text(JSON.stringify(required)), isError: true };
}

// A local MCP server with paid tools, the x402 MCP way. "broken" settles
// and then fails; "free" costs nothing.
export async function startX402McpServer(name = "paid-tools") {
    const facilitator = stubFacilitator();
    const server = new Server({ name, version: "1.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const tool = request.params.name;
        if (tool === "free") {
            return { content: text("free answer") };
        }
        const payment = request.params._meta?.["x402/payment"];
        if (payment === undefined) {
            return priceResult(tool);
        }
        const option = paidOption(payment, price(tool));
        const invalid = option === undefined ? "unknown_option" : facilitator.verify(payment);
        if (invalid !== undefined) {
            return priceResult(tool, invalid);
        }
        const settlement = facilitator.settle(String(option?.network));
        const failed = tool === "broken" || !settlement.success;
        return {
            content: text(failed ? "tool failed" : "paid answer"),
            isError: failed,
            _meta: { "x402/payment-response": settlement },
        };
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: "agent", version: "1.0.0" });
    await client.connect(clientSide);
    return { client, facilitator, close: () => client.close() };
}
