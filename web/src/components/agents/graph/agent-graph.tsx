"use client";

import { ChartPane } from "@/components/charts/chart-pane";
import { ChartTable } from "@/components/charts/chart-table";
import { EmptyLine } from "@/components/kit/empty";
import { Pane } from "@/components/kit/pane";
import type { AgentGraph as Graph } from "@/lib/data/agents";
import { formatInt, formatShare, formatShortDate, formatClock } from "@/lib/format";
import { edgeKind, plural } from "../lib/words";
import { GraphField } from "./graph-field";
import { GraphLegend } from "./graph-legend";

function summaryOf(graph: Graph): string {
    const { nodes, edges } = graph;
    const busiest = edges[0];
    const heavy = edges.filter((edge) => edge.untrustedShare >= 0.6).length;
    return (
        `Agent graph over the last ${graph.windowDays} days: ${nodes.length} ${plural(nodes.length, "agent")} ` +
        `and ${edges.length} ${plural(edges.length, "link")}. ` +
        `The busiest link is ${busiest.from} to ${busiest.to} with ${formatInt(busiest.total)} ${plural(busiest.total, "message")}. ` +
        `${heavy} ${plural(heavy, "link carries", "links carry")} mostly untrusted content.`
    );
}

// The agent graph pane: a drawing with hover readouts, and a table of every link behind the toggle
export function AgentGraph({ graph }: { graph: Graph }) {
    if (graph.edges.length === 0) {
        return (
            <Pane title="Agent graph">
                <EmptyLine inset>No links between agents yet</EmptyLine>
            </Pane>
        );
    }
    const edges = [...graph.edges].sort((a, b) => b.total - a.total);
    const total = edges.reduce((sum, edge) => sum + edge.total, 0);
    const untrusted = edges.reduce((sum, edge) => sum + edge.untrusted, 0);

    const table = (
        <ChartTable
            caption={`Links between agents over the last ${graph.windowDays} days`}
            height={340}
            columns={[
                { label: "From", align: "left" },
                { label: "To", align: "left" },
                { label: "Mostly", align: "left" },
                { label: "Messages" },
                { label: "Untrusted" },
                { label: "Share" },
                { label: "Last seen" },
            ]}
            rows={edges.map((edge) => ({
                key: `${edge.from}>${edge.to}`,
                cells: [
                    edge.from,
                    edge.to,
                    edgeKind(edge),
                    formatInt(edge.total),
                    formatInt(edge.untrusted),
                    formatShare(edge.untrustedShare),
                    `${formatShortDate(edge.lastAt)} ${formatClock(edge.lastAt)}`,
                ],
            }))}
        />
    );

    return (
        <ChartPane
            title="Agent graph"
            tag={`${graph.windowDays}D`}
            readouts={[
                { label: "Links", value: formatInt(edges.length) },
                { label: "Messages", value: formatInt(total) },
                { label: "Untrusted", value: formatShare(untrusted / total) },
            ]}
            table={table}
        >
            <GraphField nodes={graph.nodes} edges={edges} summary={summaryOf({ ...graph, edges })} />
            <GraphLegend />
        </ChartPane>
    );
}
