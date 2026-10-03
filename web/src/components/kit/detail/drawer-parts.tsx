import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

// The full identifier under a drawer title, with a Copy button on the same line
export function IdentifierRow({ value, className }: { value: string; className?: string }) {
    return (
        <div className={cn("mt-5 flex items-center gap-3", className)}>
            <span className="mono min-w-0 text-[13px] text-ink-muted wrap-anywhere">{value}</span>
            <CopyButton value={value} />
        </div>
    );
}

// A drawer section opens with a hairline and 22px of padding, 28px below the block before it
export function DrawerSection({
    title,
    children,
    className,
}: {
    title?: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={cn("mt-7 border-t border-line pt-[22px]", className)}>
            {title ? <h3 className="mb-4 text-[15px] leading-[1.4] font-extralight text-ink">{title}</h3> : null}
            {children}
        </section>
    );
}

type DrawerActionsProps = { children: ReactNode; cancel?: ReactNode; className?: string };

// Full-width actions at the end of the content, with a centered text-button cancel 14px under them
export function DrawerActions({ children, cancel, className }: DrawerActionsProps) {
    return (
        <div className={cn("mt-[26px]", className)}>
            <div className="grid gap-2 *:w-full">{children}</div>
            {cancel ? <div className="mt-[14px] flex justify-center">{cancel}</div> : null}
        </div>
    );
}
