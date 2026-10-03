import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Open-sided tables: hairlines only, a recess header band, 64px rows, last column right-aligned.
export function DataTable({
    children,
    minWidth = 680,
    className,
}: {
    children: ReactNode;
    minWidth?: number;
    className?: string;
}) {
    return (
        <div className="table-scroll relative">
            <table
                className={cn(
                    "w-full table-fixed border-collapse text-left text-[13px] whitespace-nowrap [&_td:last-child]:text-right [&_th:last-child]:text-right",
                    className,
                )}
                style={{ minWidth }}
            >
                {children}
            </table>
        </div>
    );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
    return (
        <th
            scope="col"
            className={cn(
                "h-[34px] border-y border-line bg-recess px-[10px] text-[12px] font-normal text-ink-muted",
                className,
            )}
            {...props}
        />
    );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
    return <td className={cn("h-16 border-b border-line px-[10px] py-[11px] align-middle", className)} {...props} />;
}

type TrProps = { className?: string; children: ReactNode; interactive?: boolean };

// Only rows that open something get a hover fill and a pointer; put a RowLink in one cell.
export function Tr({ className, children, interactive }: TrProps) {
    return (
        <tr className={cn(interactive && "group/row relative cursor-pointer hover:bg-nav-hover", className)}>
            {children}
        </tr>
    );
}

// The two-line identity cell: a 31px icon tile, a name and an identifier under it.
export function NameCell({
    icon,
    name,
    sub,
    mono,
}: {
    icon?: ReactNode;
    name: ReactNode;
    sub?: ReactNode;
    mono?: boolean;
}) {
    return (
        <span className="flex min-w-0 items-center gap-[9px]">
            {icon ? (
                <span className="grid size-[31px] shrink-0 place-items-center rounded-sm bg-tile text-ink-2">
                    {icon}
                </span>
            ) : null}
            <span className="flex min-w-0 flex-col">
                <strong className={cn("truncate text-[14px] font-[450] text-ink", mono && "mono font-normal")}>
                    {name}
                </strong>
                {sub ? <small className="-mt-1 truncate text-[11px] text-ink-note">{sub}</small> : null}
            </span>
        </span>
    );
}

// A quiet one-line empty, no-match or unavailable row under a compact table.
export function QuietEmpty({ children }: { children: ReactNode }) {
    return (
        <div
            role="status"
            className="flex h-[84px] items-center justify-center border-b border-line text-center text-[12px] whitespace-normal text-ink-muted"
        >
            {children}
        </div>
    );
}

// The centered state block under a full table: heading, one sentence, at most one action.
export function TableState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
    return (
        <div className="flex min-h-[190px] flex-col items-center justify-center gap-3 px-[18px] py-[25px] text-center">
            <h3 className="text-[14px] font-[450] text-ink">{title}</h3>
            {body ? <p className="max-w-[44ch] text-[13px] text-ink-muted">{body}</p> : null}
            {action}
        </div>
    );
}
