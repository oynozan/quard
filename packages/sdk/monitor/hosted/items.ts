import { asRecord } from "../json.ts";
import type { Step } from "../step.ts";
import { noteApprovalRequest, labelMcpCall } from "./mcp.ts";
import { consultedUrls, labelWebSearch } from "./web-search.ts";

// Handles one output item of a hosted tool, once, whether it came in a
// stream event or in the finished response
export function seeHostedItem(step: Step, value: unknown): void {
    const item = asRecord(value);
    if (item === undefined || typeof item.id !== "string" || step.hosted.has(item.id)) {
        return;
    }
    if (item.type === "mcp_approval_request") {
        noteApprovalRequest(step, item);
    } else if (item.type === "mcp_call") {
        labelMcpCall(step, item);
    } else {
        const urls = consultedUrls(item);
        if (urls.length === 0) {
            return;
        }
        labelWebSearch(step, urls);
    }
    step.hosted.add(item.id);
}
