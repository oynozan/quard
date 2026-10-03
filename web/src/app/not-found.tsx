import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { QuardMark } from "@/components/shell/quard-mark";

export const metadata: Metadata = { title: "Page not found" };

// A system page: centered column, one sentence, two ways out
export default function NotFound() {
    return (
        <main
            id="content"
            className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page p-6 text-center"
        >
            <span className="flex items-center gap-[10px] text-[12px] font-light text-ink-muted">
                <QuardMark size={14} />
                <span className="mono">404</span>
            </span>
            <h1 className="text-[24px] leading-[1.3] font-extralight tracking-[-0.2px] text-ink">Page not found</h1>
            <p className="max-w-[46ch] text-[14px] leading-[1.75] text-ink-muted">
                It may have expired with the retention window.
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <Link href="/search" className={buttonVariants({ variant: "outline" })}>
                    Search runs
                </Link>
                <Link href="/" className={buttonVariants({ variant: "default" })}>
                    Go to overview
                </Link>
            </div>
        </main>
    );
}
