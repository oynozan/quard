import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PaneProps = {
    title: string;
    tag?: string;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
    bodyClassName?: string;
};

// A terminal pane: a 38px recess header strip over a page-colored body. Square corners.
export function Pane({ title, tag, actions, children, className, bodyClassName }: PaneProps) {
    return (
        <section aria-label={title} className={cn("flex min-w-0 flex-col border border-line bg-page", className)}>
            <PaneHeader title={title} tag={tag} actions={actions} />
            <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
        </section>
    );
}

export function PaneHeader({ title, tag, actions }: { title: string; tag?: string; actions?: ReactNode }) {
    return (
        <header className="flex min-h-[38px] items-center justify-between gap-2 border-b border-line bg-recess px-3 max-[760px]:px-[9px]">
            <h2 className="truncate text-[12px] font-light text-ink-link max-[760px]:text-[11px]">{title}</h2>
            <div className="flex shrink-0 items-center gap-3">
                {tag ? <span className="mono text-[11px] leading-none text-ink-muted">{tag}</span> : null}
                {actions}
            </div>
        </header>
    );
}
