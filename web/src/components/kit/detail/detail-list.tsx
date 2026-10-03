import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StatusSquare } from "@/components/kit/labels";

// Term and value rows divided by hairlines, with values on the right at most 60% wide
export function DetailList({ children, className }: { children: ReactNode; className?: string }) {
    return <dl className={cn("text-[13px] leading-[1.55]", className)}>{children}</dl>;
}

type DetailRowProps = { term: ReactNode; children: ReactNode; mono?: boolean; title?: string };

export function DetailRow({ term, children, mono, title }: DetailRowProps) {
    return (
        <div className="flex items-start justify-between gap-5 border-b border-line py-3 last:border-b-0">
            <dt className="shrink-0 text-ink-muted">{term}</dt>
            <dd title={title} className={cn("max-w-[60%] text-right text-ink wrap-anywhere", mono && "mono")}>
                {children}
            </dd>
        </div>
    );
}

type Tone = "on" | "off" | "context" | "warning" | "danger";

// A status value written as a 6px square and a word
export function StatusValue({ tone, children }: { tone: Tone; children: ReactNode }) {
    return (
        <span className="inline-flex items-center gap-2">
            <StatusSquare tone={tone} />
            {children}
        </span>
    );
}

// An absent value written as a word, such as "Not set" or "None"
export function Absent({ children }: { children: ReactNode }) {
    return <span className="text-ink-absent">{children}</span>;
}

// A value that can never be known
export function Unknown() {
    return (
        <span className="text-ink-absent">
            <span aria-hidden>—</span>
            <span className="sr-only">Unknown</span>
        </span>
    );
}
