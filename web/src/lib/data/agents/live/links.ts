import type { AgentLinkRow, AgentMessageRow } from "@quard/db";
import type { AgentEdge } from "../types";
import { edgeOf, share } from "./rows";

const keyOf = (row: { from: string; to: string }) => JSON.stringify([row.from, row.to]);

// Delegations, handoffs and messages between the same two agents make one link, busiest first.
// A message that was a delegation across processes joins the ones made in-process,
// once however many messages name it.
export function linksOf(delegations: AgentLinkRow[], messages: AgentMessageRow[]): AgentEdge[] {
    const links = new Map(delegations.map((row) => [keyOf(row), edgeOf(row)]));
    for (const row of messages) {
        const link = links.get(keyOf(row));
        const delegated = (link?.delegations ?? 0) + row.delegated;
        const plain = row.messages - row.delegatedMessages;
        const total = delegated + row.handoffs + plain;
        const untrusted = (link?.untrusted ?? 0) + row.untrusted;
        links.set(keyOf(row), {
            from: row.from,
            to: row.to,
            delegations: delegated,
            handoffs: row.handoffs,
            messages: plain,
            total,
            untrusted,
            untrustedShare: share(untrusted, total),
            lastAt: Math.max(link?.lastAt ?? 0, row.lastAt.getTime()),
        });
    }
    return [...links.values()].sort((a, b) => b.total - a.total);
}
