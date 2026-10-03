import Link from "next/link";
import { PageFrame } from "@/components/agents/list/page-frame";
import { buttonVariants } from "@/components/ui/button";

export default function AgentNotFound() {
    return (
        <PageFrame>
            <h1 className="text-[26px] leading-[1.3] font-extralight tracking-[-0.2px]">Agent not found</h1>
            <p className="mt-3 text-[14px] text-ink-note">Names are case sensitive.</p>
            <Link href="/agents" className={buttonVariants({ variant: "outline", className: "mt-6" })}>
                Back to agents
            </Link>
        </PageFrame>
    );
}
