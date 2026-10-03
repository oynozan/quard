import { TextLink } from "@/components/kit/links";
import { Pane } from "@/components/kit/pane";
import type { RunEdge, RunGraph as Graph } from "@/lib/data/runs/types";
import { agentTree, type TreeNode } from "./lib/tree";
import { EDGE_WORD, formatOffset } from "./lib/words";
import { MessageList } from "./message-list";
import { costText } from "./lib/cost";

function UntrustedChip() {
    return (
        <span className="inline-flex items-center rounded-sm bg-caution-surface px-[6px] text-[11px] leading-[18px] text-caution-text">
            untrusted
        </span>
    );
}

function Node({ node, edges, startedAt }: { node: TreeNode; edges: RunEdge[]; startedAt: number }) {
    const { agent } = node;
    const incoming = edges.find((edge) => edge.to === agent.name && edge.from === agent.parent);
    return (
        <li className="relative">
            {agent.parent ? (
                <span aria-hidden className="absolute top-[21px] -left-[18px] h-px w-[18px] bg-line-strong" />
            ) : null}
            {incoming ? (
                <p
                    title={`${EDGE_WORD[incoming.kind]} from ${incoming.from} over ${incoming.channel}`}
                    className="mb-[6px] flex flex-wrap items-center gap-2 text-[11px] font-light text-ink-muted"
                >
                    <span>
                        {EDGE_WORD[incoming.kind]} ·{" "}
                        <span className="mono">{formatOffset(incoming.at - startedAt)}</span>
                    </span>
                    {incoming.untrusted ? <UntrustedChip /> : null}
                </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-panel px-3 py-[10px]">
                <div className="flex min-w-0 items-baseline gap-2">
                    <TextLink href={`/agents/${encodeURIComponent(agent.name)}`} mono className="truncate text-[13px]">
                        {agent.name}
                    </TextLink>
                    {agent.version ? <span className="mono text-[11px] text-ink-muted">{agent.version}</span> : null}
                    {agent.model ? (
                        <span className="mono truncate text-[11px] text-ink-faint">{agent.model}</span>
                    ) : null}
                </div>
                <div className="mono flex shrink-0 items-center gap-3 text-[11px] text-ink-2">
                    <span>
                        {agent.steps} <span className="font-sans font-light text-ink-muted">steps</span>
                    </span>
                    <span>{costText(agent.costUsd, agent.costKnown, (usd) => `$${usd.toFixed(4)}`)}</span>
                    {agent.influenced ? <UntrustedChip /> : null}
                </div>
            </div>
            {node.children.length ? (
                <ul className="mt-[14px] ml-[14px] grid gap-[14px] border-l border-line-strong pl-[18px]">
                    {node.children.map((child) => (
                        <Node key={child.agent.name} node={child} edges={edges} startedAt={startedAt} />
                    ))}
                </ul>
            ) : null}
        </li>
    );
}

// The root agent at the top, delegated agents as children, then every message in time order
export function RunGraph({ graph, startedAt }: { graph: Graph; startedAt: number }) {
    const tree = agentTree(graph.nodes);
    return (
        <Pane title="Run graph">
            <div className="p-3 pb-4">
                <ul className="grid gap-[14px]" aria-label="Agents by delegation">
                    {tree.map((node) => (
                        <Node key={node.agent.name} node={node} edges={graph.edges} startedAt={startedAt} />
                    ))}
                </ul>
                <MessageList edges={graph.edges} startedAt={startedAt} />
            </div>
        </Pane>
    );
}
