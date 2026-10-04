"use client";

import { ErrorBox } from "@/components/kit/feedback/feedback";
import { PageHeading } from "@/components/kit/headings";
import { PAGE_LIST } from "@/components/kit/page";
import { Button } from "@/components/ui/button";

export default function LabelsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
    return (
        <div className={PAGE_LIST}>
            <PageHeading title="Labels" />
            <ErrorBox
                className="mt-0 max-w-[560px]"
                help="Labels keep arriving. No review was lost."
                action={
                    <Button size="sm" onClick={() => retry()}>
                        Try again
                    </Button>
                }
            >
                Labels could not be loaded.
            </ErrorBox>
        </div>
    );
}
