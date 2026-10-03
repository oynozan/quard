import type { ReactNode } from "react";
import { Absent } from "@/components/kit/detail/detail-list";
import { TextLink } from "@/components/kit/links";
import { Pane } from "@/components/kit/pane";
import type { AgentDetail, AgentEdge } from "@/lib/data/agents";
import { formatInt, formatShare } from "@/lib/format";
import { shareStyle } from "../lib/tones";
import { plural } from "../lib/words";

function Block({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="border-b border-line px-3 py-[14px] last:border-b-0">
            <h3 className="mb-[10px] text-[12px] font-light text-ink-muted">{title}</h3>
            {children}
        </div>
    );
}

function ToolChips({ tools }: { tools: string[] }) {
    return (
        <ul className="flex flex-wrap gap-[6px]">
            {tools.map((tool) => (
                <li key={tool} className="mono rounded-sm bg-tile px-[7px] text-[11px] leading-[20px] text-ink-2">
                    {tool}
                </li>
            ))}
        </ul>
    );
}

type Peer = { agent: string; count: number; edge: AgentEdge };

// One linked agent on one line: how often they talked and how much was untrusted
function LinkRow({ link, word, suffix = "" }: { link: Peer; word: string; suffix?: string }) {
    const untrusted = shareStyle(link.edge.untrustedShare).tone === "untrusted";
    return (
        <li className="flex items-baseline justify-between gap-3 text-[12px]">
            <TextLink mono href={`/agents/${encodeURIComponent(link.agent)}`} className="truncate text-[13px]">
                {link.agent}
            </TextLink>
            <span className="shrink-0 font-light text-ink-muted">
                <span className="mono text-ink-2">{formatInt(link.count)}</span> {plural(link.count, word)}
                {suffix}
                {" · "}
                <span className={untrusted ? "text-caution-text" : undefined}>
                    <span className={untrusted ? "mono" : "mono text-ink-2"}>
                        {formatShare(link.edge.untrustedShare)}
                    </span>{" "}
                    untrusted
                </span>
            </span>
        </li>
    );
}

function PeerList({ peers, word, suffix }: { peers: Peer[]; word: string; suffix?: string }) {
    return (
        <ul className="grid gap-[10px]">
            {peers.map((link) => (
                <LinkRow key={`${suffix ?? ""}${link.agent}`} link={link} word={word} suffix={suffix} />
            ))}
        </ul>
    );
}

function links(edges: AgentEdge[], pick: (edge: AgentEdge) => number, side: "from" | "to"): Peer[] {
    return edges
        .map((edge) => ({ agent: edge[side], count: pick(edge), edge }))
        .filter((link) => link.count > 0)
        .sort((a, b) => b.count - a.count);
}

// The tools it holds, who it delegates to, and who it works for, over the last 30 days
export function AgentPermissions({ detail }: { detail: AgentDetail }) {
    const { agent } = detail;
    const out = detail.links.filter((edge) => edge.from === agent.name);
    const into = detail.links.filter((edge) => edge.to === agent.name);
    const delegatesTo = links(out, (edge) => edge.delegations, "to");
    const delegatedBy = links(into, (edge) => edge.delegations, "from");
    const handsTo = links(out, (edge) => edge.handoffs, "to");
    const handsFrom = links(into, (edge) => edge.handoffs, "from");
    const canDelegate = agent.tools.includes("delegate");

    return (
        <Pane title="Permissions" tag="30D">
            <Block title="Tools">
                <ToolChips tools={agent.tools} />
            </Block>
            <Block title="Delegates to">
                {delegatesTo.length ? (
                    <PeerList peers={delegatesTo} word="delegation" />
                ) : (
                    <p className="text-[12px]">
                        <Absent>{canDelegate ? "None" : "None · no delegate tool"}</Absent>
                    </p>
                )}
            </Block>
            <Block title="Works for">
                {delegatedBy.length ? (
                    <PeerList peers={delegatedBy} word="delegation" />
                ) : (
                    <p className="text-[12px]">
                        <Absent>None · starts its own runs</Absent>
                    </p>
                )}
            </Block>
            {handsTo.length || handsFrom.length ? (
                <Block title="Handoffs">
                    <PeerList peers={handsTo} word="handoff" suffix=" out" />
                    {handsTo.length && handsFrom.length ? <div className="h-[10px]" /> : null}
                    <PeerList peers={handsFrom} word="handoff" suffix=" in" />
                </Block>
            ) : null}
        </Pane>
    );
}
