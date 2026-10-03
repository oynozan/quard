"use client";

import { useEffect } from "react";
import { PageFrame } from "@/components/agents/list/page-frame";
import { PageHeading } from "@/components/kit/headings";
import { ErrorBox } from "@/components/kit/feedback/feedback";
import { Button } from "@/components/ui/button";

export default function AgentsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <PageFrame>
            <PageHeading title="Agents" />
            <ErrorBox
                className="max-w-[560px]"
                action={
                    <Button variant="outline" size="sm" onClick={() => retry()}>
                        Try again
                    </Button>
                }
            >
                Could not load the agent graph.
            </ErrorBox>
        </PageFrame>
    );
}
