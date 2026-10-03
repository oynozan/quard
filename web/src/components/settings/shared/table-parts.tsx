import type { ReactNode } from "react";
import { Th } from "@/components/kit/data-table";
import { cn } from "@/lib/utils";
import { formatAge, formatLongDate, formatShortDate } from "@/lib/format";

// Column shares for a table whose first column merges the 44px selection slot
export function Cols({ widths }: { widths: string[] }) {
    return (
        <colgroup>
            <col style={{ width: "44px" }} />
            {widths.map((width, index) => (
                <col key={index} style={{ width }} />
            ))}
        </colgroup>
    );
}

// A full-page header row: 39px band, the first cell spans the selection slot
export function Head({ first, rest }: { first: string; rest: ReactNode[] }) {
    return (
        <thead>
            <tr>
                <Th colSpan={2} className="h-[39px] pl-[54px]">
                    {first}
                </Th>
                {rest.map((cell, index) => (
                    <Th key={index} className="h-[39px]">
                        {cell}
                    </Th>
                ))}
            </tr>
        </thead>
    );
}

// The first cell of a row, padded past the merged selection slot
export const FIRST_CELL = "pl-[54px]";

// "3 Oct" with the long form in a tooltip
export function ShortDate({ time, className }: { time: number; className?: string }) {
    return (
        <time
            dateTime={new Date(time).toISOString()}
            title={formatLongDate(time)}
            className={cn("mono text-[12px] text-ink-2", className)}
        >
            {formatShortDate(time)}
        </time>
    );
}

// "12 min ago" with the number in mono and the long date in a tooltip
export function Ago({ time, now }: { time: number; now: number }) {
    const [value, unit] = formatAge(time, now).split(" ");
    return (
        <time dateTime={new Date(time).toISOString()} title={formatLongDate(time)} className="text-[12px] text-ink-2">
            <span className="mono">{value}</span> {unit} ago
        </time>
    );
}

// A secondary cell line in 12px Text Secondary
export function Quiet({ children, title, mono }: { children: ReactNode; title?: string; mono?: boolean }) {
    return (
        <span title={title} className={cn("block truncate text-[12px] text-ink-2", mono && "mono")}>
            {children}
        </span>
    );
}
