"use client";

import { FleetContainer } from "@/components/fleet/fleet-view";
import { PageHeading } from "@/components/kit/headings";
import { ErrorBox } from "@/components/kit/feedback/feedback";
import { Button } from "@/components/ui/button";

export default function SummaryError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
    return (
        <FleetContainer>
            <PageHeading title="Summary" />
            <ErrorBox
                help="Guards keep running."
                action={
                    <Button variant="outline" size="sm" onClick={() => retry()}>
                        Try again
                    </Button>
                }
            >
                The fleet view could not be loaded.
            </ErrorBox>
        </FleetContainer>
    );
}
