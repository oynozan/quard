"use client";

import { PageHeading } from "@/components/kit/headings";
import { ErrorBox } from "@/components/kit/feedback/feedback";
import { Button } from "@/components/ui/button";
import { PAGE_LIST } from "@/components/kit/page";

export default function ApprovalsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
    return (
        <div className={PAGE_LIST}>
            <PageHeading title="Approvals" />
            <ErrorBox
                className="mt-0 max-w-[560px]"
                help="Open requests keep waiting. No answer was lost."
                action={
                    <Button size="sm" onClick={() => retry()}>
                        Try again
                    </Button>
                }
            >
                Approvals could not be loaded.
            </ErrorBox>
        </div>
    );
}
