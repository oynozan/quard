import type { AgentVersionItem } from "@quard/db";
import type { AgentVersionRow } from "../types";

// The newest `limit` versions, each live until the next one was first seen
export function versionsOf(items: AgentVersionItem[], limit: number): AgentVersionRow[] {
    return items.slice(0, limit).map((item, index) => ({
        version: item.version,
        model: item.model,
        instructionsHash: item.instructionsHash,
        tools: item.tools,
        // Read past the limit, since the oldest version listed may not be the first
        toolsBefore: items[index + 1]?.tools ?? null,
        since: item.firstSeenAt.getTime(),
        until: items[index - 1]?.firstSeenAt.getTime() ?? null,
        note: "",
        current: index === 0,
        incidents: [],
    }));
}
