"use client";

import { useEffect } from "react";
import { ErrorBox } from "@/components/kit/feedback/feedback";
import { PageHeading } from "@/components/kit/headings";
import { SETTINGS_CONTAINER } from "@/components/settings/tabs";
import { Button } from "@/components/ui/button";

export default function SettingsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className={SETTINGS_CONTAINER}>
            <PageHeading title="Settings" />
            <ErrorBox
                className="max-w-[560px]"
                action={
                    <Button variant="outline" size="sm" onClick={() => retry()}>
                        Try again
                    </Button>
                }
            >
                Could not load settings. Nothing was changed.
            </ErrorBox>
        </div>
    );
}
