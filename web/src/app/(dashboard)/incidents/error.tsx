"use client";

import { PageHeading } from "@/components/kit/headings";
import { ErrorBox } from "@/components/kit/feedback/feedback";
import { Button } from "@/components/ui/button";
import { PAGE_LIST } from "@/components/kit/page";

export default function IncidentsError({ reset }: { error: Error; reset: () => void }) {
    return (
        <div className={PAGE_LIST}>
            <PageHeading title="Incidents" />
            <ErrorBox
                help="Your incidents are safe. This only affects loading them."
                action={
                    <Button variant="outline" size="sm" onClick={reset}>
                        Try again
                    </Button>
                }
            >
                Incidents could not be loaded.
            </ErrorBox>
        </div>
    );
}
