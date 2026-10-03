"use client";

import { useEffect } from "react";
import { ErrorBox } from "@/components/kit/feedback/feedback";
import { PageHeading } from "@/components/kit/headings";
import { PAGE_WIDE } from "@/components/kit/page";
import { Button } from "@/components/ui/button";

// The overview's error page, shown inside the app shell so the rest stays usable
export default function OverviewError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className={PAGE_WIDE}>
            <PageHeading title="Overview" />
            <ErrorBox
                className="mt-0 max-w-[560px]"
                help="Guards keep running."
                action={
                    <Button variant="outline" size="sm" onClick={() => retry()}>
                        Try again
                    </Button>
                }
            >
                The overview could not be loaded.
            </ErrorBox>
        </div>
    );
}
