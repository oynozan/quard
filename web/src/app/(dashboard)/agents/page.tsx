import type { Metadata } from "next";
import { AgentGraph } from "@/components/agents/graph/agent-graph";
import { AgentRoster } from "@/components/agents/list/agent-roster";
import { AgentsGrid, PageFrame } from "@/components/agents/list/page-frame";
import { EmptyLine } from "@/components/kit/empty";
import { PageHeading } from "@/components/kit/headings";
import { getAgentGraph } from "@/lib/data/agents";

export const metadata: Metadata = { title: "Agents" };

export default async function AgentsPage() {
    const graph = await getAgentGraph();

    return (
        <PageFrame>
            <PageHeading title="Agents" />
            {graph.nodes.length === 0 ? (
                <EmptyLine>No agents yet</EmptyLine>
            ) : (
                <AgentsGrid>
                    <AgentGraph graph={graph} />
                    <AgentRoster agents={graph.nodes} />
                </AgentsGrid>
            )}
        </PageFrame>
    );
}
