import type { AgentVersionItem } from "@quard/db";
import type { AgentVersionRow } from "../types";

// Newest first, each version live until the next one was first seen
export function versionsOf(items: AgentVersionItem[]): AgentVersionRow[] {
    return items.map((item, index) => ({
        version: item.version,
        model: item.model,
        instructionsHash: item.instructionsHash,
        tools: item.tools,
        since: item.firstSeenAt.getTime(),
        until: items[index - 1]?.firstSeenAt.getTime() ?? null,
        note: "",
        current: index === 0,
        incidents: [],
    }));
}
