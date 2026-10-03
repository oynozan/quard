"use client";

import { useEffect } from "react";
import { ErrorBox } from "@/components/kit/feedback/feedback";
import { RunsHeading } from "@/components/runs/list/runs-heading";
import { Button } from "@/components/ui/button";
import { PAGE_LIST } from "@/components/kit/page";

export default function RunsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className={PAGE_LIST}>
            <RunsHeading />
            <ErrorBox
                className="max-w-[560px]"
                action={
                    <Button variant="outline" size="sm" onClick={() => retry()}>
                        Try again
                    </Button>
                }
            >
                Could not load runs.
            </ErrorBox>
        </div>
    );
}
