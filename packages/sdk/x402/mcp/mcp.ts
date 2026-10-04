import { priceFrom, removeSecrets, settlementFrom } from "@quard/shared";
import { asRecord, parseJson } from "../../monitor/json.ts";
import { isChecked } from "../checked.ts";
import {
    paidStep,
    recordPrice,
    recordRefused,
    recordRejected,
    recordSettlement,
    recordSigned,
    warnUnguarded,
    type Place,
} from "../record/payments.ts";
import { UNGUARDED_REASON, unguardedResult } from "../refusal.ts";

// x402 over MCP: a paid tool answers with its price as an error result,
// and the payment travels in _meta["x402/payment"].

export const MCP_PAYMENT = "x402/payment";
export const MCP_PAYMENT_RESPONSE = "x402/payment-response";

type ToolParams = { name: string; _meta?: Record<string, unknown> };

// The MCP client calls this needs, such as @modelcontextprotocol/sdk's Client
export type McpToolClient = {
    callTool(params: ToolParams, ...rest: never[]): Promise<unknown>;
    getServerVersion?(): { name?: string } | undefined;
};

// A price in an error result: structuredContent first, then the first text
function priceIn(result: Record<string, unknown> | undefined): ReturnType<typeof priceFrom> {
    if (result?.isError !== true) {
        return undefined;
    }
    const first = Array.isArray(result.content) ? asRecord(result.content[0]) : undefined;
    const text = first?.type === "text" && typeof first.text === "string" ? parseJson(first.text) : undefined;
    return priceFrom(result.structuredContent) ?? priceFrom(text);
}

function urlIn(value: unknown): string | undefined {
    const url = asRecord(asRecord(value)?.resource)?.url;
    return typeof url === "string" ? url : undefined;
}

function placeOf(client: McpToolClient, tool: string, url: string | undefined): Place {
    const host = client.getServerVersion?.()?.name ?? "mcp";
    return { key: `mcp:${host}:${tool}`, host, resource: removeSecrets(url ?? `mcp://tool/${tool}`) };
}

function noteResult(result: Record<string, unknown> | undefined, step: ReturnType<typeof paidStep>): void {
    const settlement = settlementFrom(asRecord(result?._meta)?.[MCP_PAYMENT_RESPONSE]);
    if (settlement !== undefined) {
        recordSettlement(step, settlement, result?.isError !== true);
    } else if (result?.isError === true) {
        // A price again means the server turned the payment down
        const price = priceIn(result);
        if (price !== undefined) {
            recordRejected(step, price.error);
        }
    }
}

// quard.x402Mcp(client): records the x402 payments of an MCP client's tool
// calls, and keeps back a payment no x402 guard checked.
export function x402Mcp<T extends McpToolClient>(client: T): T {
    const callTool = async (params: ToolParams, ...rest: never[]): Promise<unknown> => {
        const meta = params._meta;
        if (meta === undefined || !Object.hasOwn(meta, MCP_PAYMENT)) {
            const result = await client.callTool(params, ...rest);
            const price = priceIn(asRecord(result));
            if (price !== undefined) {
                recordPrice(placeOf(client, params.name, urlIn(price)), price);
            }
            return result;
        }
        const payment = meta[MCP_PAYMENT];
        const step = paidStep(placeOf(client, params.name, urlIn(payment)), payment);
        if (payment === undefined || !isChecked(payment)) {
            recordRefused(step, UNGUARDED_REASON);
            warnUnguarded(step);
            return unguardedResult();
        }
        recordSigned(step);
        const result = await client.callTool(params, ...rest);
        noteResult(asRecord(result), step);
        return result;
    };
    return new Proxy(client, {
        get(target, key) {
            if (key === "callTool") {
                return callTool;
            }
            const value: unknown = Reflect.get(target, key, target);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
}
