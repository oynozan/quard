"use client";

import { ErrorBox } from "@/components/kit/feedback/feedback";
import { Button } from "@/components/ui/button";
import { PAGE_WIDE } from "@/components/kit/page";

export default function RunError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
    return (
        <div className={PAGE_WIDE}>
            <h1 className="text-[26px] leading-[1.3] font-extralight tracking-[-0.2px]">Run</h1>
            <ErrorBox
                className="max-w-[560px]"
                help="Your data is safe. Try again, or come back in a minute."
                action={
                    <Button size="sm" onClick={() => retry()}>
                        Try again
                    </Button>
                }
            >
                This run could not be loaded.
            </ErrorBox>
        </div>
    );
}
