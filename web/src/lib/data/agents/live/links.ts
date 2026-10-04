import type { AgentLinkRow, AgentMessageRow } from "@quard/db";
import type { AgentEdge } from "../types";
import { edgeOf, share } from "./rows";

const keyOf = (row: { from: string; to: string }) => JSON.stringify([row.from, row.to]);

// Delegations, handoffs and messages between the same two agents make one link, busiest first.
// Delegations across processes come as messages and join the ones made in-process.
export function linksOf(delegations: AgentLinkRow[], messages: AgentMessageRow[]): AgentEdge[] {
    const links = new Map(delegations.map((row) => [keyOf(row), edgeOf(row)]));
    for (const row of messages) {
        const link = links.get(keyOf(row));
        const delegated = (link?.delegations ?? 0) + row.delegations;
        const total = delegated + row.handoffs + row.messages;
        const untrusted = (link?.untrusted ?? 0) + row.untrusted;
        links.set(keyOf(row), {
            from: row.from,
            to: row.to,
            delegations: delegated,
            handoffs: row.handoffs,
            messages: row.messages,
            total,
            untrusted,
            untrustedShare: share(untrusted, total),
            lastAt: Math.max(link?.lastAt ?? 0, row.lastAt.getTime()),
        });
    }
    return [...links.values()].sort((a, b) => b.total - a.total);
}
