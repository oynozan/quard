"use client";

import { FleetContainer } from "@/components/fleet/fleet-view";
import { PageHeading } from "@/components/kit/headings";
import { ErrorBox } from "@/components/kit/feedback/feedback";
import { Button } from "@/components/ui/button";

export default function FleetError({ reset }: { error: Error; reset: () => void }) {
    return (
        <FleetContainer>
            <PageHeading title="Fleet" />
            <ErrorBox
                help="Guards keep running."
                action={
                    <Button variant="outline" size="sm" onClick={reset}>
                        Try again
                    </Button>
                }
            >
                The fleet view could not be loaded.
            </ErrorBox>
        </FleetContainer>
    );
}
