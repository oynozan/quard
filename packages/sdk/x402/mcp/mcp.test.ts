import type { PaymentEvent, RunEvent } from "@quard/shared";
import { x402MCPClient } from "@x402/mcp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { quard } from "../../index.ts";
import { resetAll } from "../../test/reset.ts";
import { testClient } from "../../test/x402/client.ts";
import { PAYEE } from "../../test/x402/facilitator.ts";
import { startX402McpServer } from "../../test/x402/mcp-server.ts";
import { markChecked } from "../checked.ts";
import { UNGUARDED_TEXT } from "../refusal.ts";
import { MCP_PAYMENT, type McpToolClient } from "./mcp.ts";

let events: RunEvent[] = [];
let closers: (() => Promise<void>)[] = [];

const payments = () => events.filter((event): event is PaymentEvent => event.type === "payment");
const stages = () => payments().map((event) => event.stage);

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(async () => {
    resetAll();
    await Promise.all(closers.map((close) => close()));
    closers = [];
});

async function paidTools(guarded = true) {
    const mcp = await startX402McpServer();
    closers.push(mcp.close);
    // @x402/mcp has its own copy of the MCP SDK, built against zod 3
    const client = quard.x402Mcp(mcp.client) as unknown as ConstructorParameters<typeof x402MCPClient>[0];
    return { mcp, tools: new x402MCPClient(client, testClient(guarded)) };
}

describe("x402Mcp", () => {
    it("records the price, the payment and the settlement of a paid tool", async () => {
        const { tools } = await paidTools();
        const result = await quard.run({ agent: "buyer" }, () => tools.callTool("weather", { city: "Oslo" }));
        expect(result.content).toEqual([{ type: "text", text: "paid answer" }]);
        expect(stages()).toEqual(["challenged", "signed", "settled"]);
        for (const event of payments()) {
            expect(event).toMatchObject({
                agent: "buyer",
                host: "paid-tools",
                resource: "mcp://tool/weather",
                network: "eip155:84532",
                amount: "10000",
                usd: 0.01,
                payTo: PAYEE,
            });
        }
        expect(payments()[2]).toMatchObject({ delivered: true, transaction: `0x${"1".padStart(64, "0")}` });
    });

    it("reads a price sent only as text, and flags a paid tool that failed", async () => {
        const { tools } = await paidTools();
        await quard.run({}, () => tools.callTool("text-priced"));
        await quard.run({}, () => tools.callTool("broken"));
        expect(stages()).toEqual(["challenged", "signed", "settled", "challenged", "signed", "settled"]);
        expect(payments()[0]?.resource).toBe("mcp://tool/text-priced");
        expect(payments()[5]).toMatchObject({ resource: "mcp://tool/broken", delivered: false });
    });

    it("records failed settlements and payments turned down", async () => {
        const { mcp, tools } = await paidTools();
        mcp.facilitator.state.settleError = "insufficient_funds";
        await quard.run({}, () => tools.callTool("weather"));
        expect(payments().at(-1)).toMatchObject({ stage: "failed", reason: "insufficient_funds" });
        mcp.facilitator.state.settleError = undefined;
        mcp.facilitator.state.invalid = "invalid_signature";
        await quard.run({}, () => tools.callTool("weather"));
        expect(payments().at(-1)).toMatchObject({ stage: "failed", reason: "invalid_signature" });
    });

    it("keeps back a payment no x402 guard checked", async () => {
        const { mcp, tools } = await paidTools(false);
        const result = await quard.run({}, () => tools.callTool("weather"));
        expect(result.isError).toBe(true);
        expect(result.content).toEqual([{ type: "text", text: UNGUARDED_TEXT }]);
        expect(mcp.facilitator.state.settled).toBe(0);
        expect(stages()).toEqual(["challenged", "refused"]);
        expect(events.filter((event) => event.type === "warning")).toHaveLength(1);
        const raw = quard.x402Mcp(mcp.client);
        const empty = await raw.callTool({ name: "weather", _meta: { [MCP_PAYMENT]: undefined } });
        expect(empty).toMatchObject({ isError: true });
        expect(mcp.facilitator.state.settled).toBe(0);
    });

    it("leaves free tools, other results and other client calls alone", async () => {
        const { mcp } = await paidTools();
        const client = quard.x402Mcp(mcp.client);
        expect(await client.callTool({ name: "free" })).toEqual({ content: [{ type: "text", text: "free answer" }] });
        expect(await client.listTools()).toEqual({ tools: [] });
        expect(client.getServerVersion()?.name).toBe("paid-tools");
        expect(typeof client.transport).toBe("object");
        expect(payments()).toEqual([]);
    });

    it("works with any client that has callTool, with no server name", async () => {
        const payment = { x402Version: 2, accepted: { scheme: "exact", network: "solana:devnet" }, payload: {} };
        markChecked(payment, "solana.example");
        const answers: unknown[] = [
            "not a record",
            { isError: true, content: [{ type: "image" }] },
            { isError: true },
            "plain paid answer",
        ];
        const client: McpToolClient = { callTool: async () => answers.shift() };
        const wrapped = quard.x402Mcp(client);
        expect(await wrapped.callTool({ name: "t" })).toBe("not a record");
        await wrapped.callTool({ name: "t" });
        await wrapped.callTool({ name: "t", _meta: { [MCP_PAYMENT]: payment } });
        expect(await wrapped.callTool({ name: "t", _meta: { [MCP_PAYMENT]: payment } })).toBe("plain paid answer");
        expect(payments()).toEqual([]);
    });
});
