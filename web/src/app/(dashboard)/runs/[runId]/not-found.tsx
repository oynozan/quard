import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { PAGE_WIDE } from "@/components/kit/page";

export default function RunNotFound() {
    return (
        <div className={PAGE_WIDE}>
            <h1 className="text-[26px] leading-[1.3] font-extralight tracking-[-0.2px]">Run not found</h1>
            <p className="mt-3 text-[14px] leading-[1.7] text-ink-note">
                Check the link. A run id is 32 hex characters.
            </p>
            <Link href="/runs" className={buttonVariants({ variant: "outline", className: "mt-6" })}>
                Back to runs
            </Link>
        </div>
    );
}
