"use client";

import { useEffect } from "react";
import { PageFrame } from "@/components/agents/list/page-frame";
import { ErrorBox } from "@/components/kit/feedback/feedback";
import { TextLink } from "@/components/kit/links";
import { Button } from "@/components/ui/button";

export default function AgentError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <PageFrame>
            <nav aria-label="Breadcrumb" className="mb-[14px] text-[12px] text-ink-muted">
                <TextLink href="/agents">Agents</TextLink>
            </nav>
            <h1 className="text-[26px] leading-[1.3] font-extralight tracking-[-0.2px]">Agent</h1>
            <ErrorBox
                className="max-w-[560px]"
                action={
                    <Button variant="outline" size="sm" onClick={() => retry()}>
                        Try again
                    </Button>
                }
            >
                Could not load this agent.
            </ErrorBox>
        </PageFrame>
    );
}
