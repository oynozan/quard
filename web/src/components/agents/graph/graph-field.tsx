"use client";

import { useId, useMemo, useState } from "react";
import { ChartTooltip } from "@/components/charts/chart-parts";
import { useCursor } from "@/components/charts/hooks/use-cursor";
import { useFitWidth } from "@/components/charts/hooks/use-fit-width";
import type { AgentEdge, AgentNode } from "@/lib/data/agents";
import { formatInt, formatShare } from "@/lib/format";
import { placeGraph, type PlacedEdge, type PlacedNode } from "../lib/graph-geometry";
import { layoutGraph } from "../lib/graph-layout";
import { SHARE_STYLES, shareStyle } from "../lib/tones";
import { plural, STATE_WORD } from "../lib/words";
import { GraphNode } from "./graph-node";

type Hover = { kind: "edge"; index: number } | { kind: "node"; name: string } | null;

function nodeRoles(agent: AgentNode): string {
    const parts = [
        agent.entryPoints ? `${agent.entryPoints} entry` : "",
        agent.turningPoints ? `${agent.turningPoints} turning` : "",
    ].filter(Boolean);
    return parts.length ? `${parts.join(", ")} ${plural(agent.entryPoints + agent.turningPoints, "point")}` : "";
}

function edgeSentence(edge: AgentEdge): string {
    return `${edge.from} to ${edge.to}: ${formatInt(edge.total)} ${plural(edge.total, "message")}, ${formatShare(edge.untrustedShare)} untrusted`;
}

function Tip({ hover, edges, nodes, agents, width }: TipProps) {
    if (!hover) return null;
    if (hover.kind === "edge") {
        const { edge, mid } = edges[hover.index];
        const right = mid.x > width / 2;
        return (
            <ChartTooltip
                x={right ? mid.x - 12 : mid.x + 12}
                y={mid.y + 8}
                alignRight={right}
                value={formatInt(edge.total)}
                unit={plural(edge.total, "message")}
                caption={`${edge.from} to ${edge.to} · ${formatShare(edge.untrustedShare)} untrusted`}
                keyColor={shareStyle(edge.untrustedShare).color}
            />
        );
    }
    const node = nodes.find((item) => item.name === hover.name)!;
    const agent = agents.get(hover.name)!;
    const right = node.x > width / 2;
    const roles = nodeRoles(agent);
    return (
        <ChartTooltip
            x={right ? node.x - 16 : node.x + 16}
            y={node.y + 14}
            alignRight={right}
            value={formatInt(agent.runs24h)}
            unit={`${plural(agent.runs24h, "run")} in 24h`}
            caption={`${STATE_WORD[agent.state]} · ${agent.app}${roles ? ` · ${roles}` : ""}`}
            keyColor={agent.state === "running" ? "var(--signal)" : "var(--chart-context)"}
        />
    );
}

type TipProps = {
    hover: Hover;
    edges: PlacedEdge[];
    nodes: PlacedNode[];
    agents: Map<string, AgentNode>;
    width: number;
};

// The graph drawing: hairline edges in SVG, agents as linked square nodes over it
export function GraphField({ nodes, edges, summary }: { nodes: AgentNode[]; edges: AgentEdge[]; summary: string }) {
    const [ref, width] = useFitWidth<HTMLDivElement>(900);
    const [pointer, setPointer] = useState<Hover>(null);
    const id = useId().replace(/:/g, "");
    const agents = useMemo(() => new Map(nodes.map((node) => [node.name, node])), [nodes]);
    const layout = useMemo(
        () =>
            layoutGraph(
                nodes.map((node) => node.name),
                edges,
            ),
        [nodes, edges],
    );
    const graph = useMemo(() => placeGraph(layout, edges, width), [layout, edges, width]);
    const cursor = useCursor(graph.edges.length, "first");

    const held: Hover = cursor.index !== null ? { kind: "edge", index: cursor.index } : pointer;
    // A link or agent removed under the pointer never fires mouseleave
    const gone = held?.kind === "edge" ? !graph.edges[held.index] : held?.kind === "node" && !agents.has(held.name);
    const hover = gone ? null : held;
    const lit = (placed: PlacedEdge, index: number) => {
        if (!hover) return true;
        if (hover.kind === "edge") return hover.index === index;
        return placed.edge.from === hover.name || placed.edge.to === hover.name;
    };
    const near = (name: string) => {
        if (!hover) return true;
        if (hover.kind === "node") {
            const other = hover.name;
            return (
                other === name ||
                edges.some((e) => (e.from === other && e.to === name) || (e.to === other && e.from === name))
            );
        }
        const { edge } = graph.edges[hover.index];
        return edge.from === name || edge.to === name;
    };
    const announce =
        hover?.kind === "edge"
            ? edgeSentence(graph.edges[hover.index].edge)
            : hover?.kind === "node"
              ? `${hover.name}: ${formatInt(agents.get(hover.name)!.runs24h)} runs in 24 hours`
              : "";

    return (
        <div ref={ref} className="relative" style={{ height: graph.height }}>
            <div
                role="img"
                tabIndex={0}
                aria-label={summary}
                aria-describedby={`${id}-keys`}
                onKeyDown={cursor.onKeyDown}
                onBlur={cursor.clear}
                className="absolute inset-0"
            >
                <svg width={graph.width} height={graph.height} className="block overflow-visible" aria-hidden>
                    <defs>
                        {[...SHARE_STYLES.map((style) => [style.tone, style.color]), ["hover", "var(--mint)"]].map(
                            ([tone, color]) => (
                                <marker
                                    key={tone}
                                    id={`${id}-${tone}`}
                                    viewBox="0 0 7 7"
                                    refX={7}
                                    refY={3.5}
                                    markerWidth={7}
                                    markerHeight={7}
                                    markerUnits="userSpaceOnUse"
                                    orient="auto"
                                >
                                    <path d="M0 0L7 3.5L0 7Z" fill={color} />
                                </marker>
                            ),
                        )}
                    </defs>
                    {graph.edges.map((placed, index) => {
                        const style = shareStyle(placed.edge.untrustedShare);
                        const active = hover !== null && lit(placed, index);
                        const w = placed.width;
                        return (
                            <g key={placed.key} opacity={lit(placed, index) ? 1 : 0.22}>
                                <path
                                    d={placed.d}
                                    fill="none"
                                    stroke={active ? "var(--mint)" : style.color}
                                    strokeWidth={w}
                                    strokeDasharray={style.dash ? `${3 + w * 2} ${2 + w}` : undefined}
                                    markerEnd={`url(#${id}-${active ? "hover" : style.tone})`}
                                />
                                <path
                                    d={placed.d}
                                    fill="none"
                                    stroke="transparent"
                                    strokeWidth={14}
                                    pointerEvents="stroke"
                                    onMouseEnter={() => setPointer({ kind: "edge", index })}
                                    onMouseLeave={() => setPointer(null)}
                                />
                            </g>
                        );
                    })}
                </svg>
            </div>
            <ul aria-label="Agents">
                {graph.nodes.map((node) => {
                    // The layout places exactly the agents it was given
                    const agent = agents.get(node.name)!;
                    return (
                        <GraphNode
                            key={node.name}
                            node={node}
                            agent={agent}
                            orientation={graph.orientation}
                            width={graph.width}
                            height={graph.height}
                            dim={!near(node.name)}
                            onFocus={() => setPointer({ kind: "node", name: node.name })}
                            onBlur={() => setPointer(null)}
                        />
                    );
                })}
            </ul>
            <Tip hover={hover} edges={graph.edges} nodes={graph.nodes} agents={agents} width={graph.width} />
            <p id={`${id}-keys`} className="sr-only">
                Use the arrow keys to step through the links. Tab moves to the agents; each opens its page.
            </p>
            <p className="sr-only" aria-live="polite">
                {announce}
            </p>
        </div>
    );
}
