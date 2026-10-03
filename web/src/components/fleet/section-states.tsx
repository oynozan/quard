import type { ReactNode } from "react";
import { EmptyLine } from "@/components/kit/empty";
import { SectionHeading } from "@/components/kit/headings";
import { Skeleton } from "@/components/ui/skeleton";

// A section with nothing to show, its title over one short line
export function EmptySection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section aria-label={title}>
            <SectionHeading title={title} />
            <EmptyLine>{children}</EmptyLine>
        </section>
    );
}

// A section's title over one small bar while the page loads, as tall as the empty line
export function LoadingSection({ title }: { title: string }) {
    return (
        <section aria-label={title} aria-busy>
            <SectionHeading title={title} />
            <div className="flex h-[21px] items-center">
                <Skeleton width={180} height={10} />
            </div>
        </section>
    );
}
