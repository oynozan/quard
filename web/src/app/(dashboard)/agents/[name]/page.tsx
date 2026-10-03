import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentView } from "@/components/agents/detail/agent-view";
import { PageFrame } from "@/components/agents/list/page-frame";
import { getAgent } from "@/lib/data/agents";
import { requestTime } from "@/lib/data/scope";

export async function generateMetadata(props: PageProps<"/agents/[name]">): Promise<Metadata> {
    const { name } = await props.params;
    const detail = await getAgent(decodeURIComponent(name));
    return { title: detail ? detail.agent.name : "Agent not found" };
}

export default async function AgentPage(props: PageProps<"/agents/[name]">) {
    const { name } = await props.params;
    const [detail, now] = await Promise.all([getAgent(decodeURIComponent(name)), requestTime()]);
    if (!detail) notFound();

    return (
        <PageFrame>
            <AgentView detail={detail} now={now} />
        </PageFrame>
    );
}
