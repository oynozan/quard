"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorBox } from "@/components/kit/feedback/feedback";
import { PageHeading } from "@/components/kit/headings";
import { Button } from "@/components/ui/button";
import { PAGE_LIST } from "@/components/kit/page";

export default function SearchError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className={PAGE_LIST}>
            <PageHeading title="Search" />
            <ErrorBox
                className="mt-0 max-w-[560px]"
                help="Your search is kept in the address, so trying again runs it again."
                action={
                    <span className="flex flex-wrap items-center gap-[14px]">
                        <Button variant="outline" size="sm" onClick={() => retry()}>
                            Try again
                        </Button>
                        <Link href="/search" className="text-[13px] text-ink-link hover:text-ink-bright">
                            Start a new search
                        </Link>
                    </span>
                }
            >
                Could not search runs.
            </ErrorBox>
        </div>
    );
}
