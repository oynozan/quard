"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PaneHeader } from "@/components/kit/pane";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { HeaderDivider, Readout, TableToggle } from "./chart-parts";

// "refetching" keeps the last frame at 45% with a spinner before the tag
export type ChartState = "ready" | "loading" | "empty" | "refetching";

export type ReadoutItem = { label: string; value: string; suffix?: string };

type ChartPaneProps = {
    title: string;
    tag?: string;
    state?: ChartState;
    readouts?: ReadoutItem[];
    // Sits at the right end of the readout row, such as a heat scale
    legend?: ReactNode;
    table: ReactNode;
    children: ReactNode;
    className?: string;
};

// A terminal pane around a chart, with the tag, the Table toggle and an optional readout row
export function ChartPane({
    title,
    tag,
    state = "ready",
    readouts = [],
    legend,
    table,
    children,
    className,
}: ChartPaneProps) {
    const [showTable, setShowTable] = useState(false);

    return (
        <section
            aria-label={title}
            aria-busy={state === "loading" || state === "refetching" || undefined}
            className={cn("flex min-w-0 flex-col border border-line bg-page", className)}
        >
            <PaneHeader
                title={title}
                actions={
                    <>
                        {state === "refetching" ? <Spinner /> : null}
                        {tag ? <span className="mono text-[11px] leading-none text-ink-muted">{tag}</span> : null}
                        {tag || state === "refetching" ? <HeaderDivider /> : null}
                        <TableToggle pressed={showTable} onToggle={() => setShowTable(!showTable)} />
                    </>
                }
            />
            <div className="min-w-0 flex-1 p-3">
                {showTable ? (
                    table
                ) : (
                    <>
                        {readouts.length > 0 || legend ? (
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
                                <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                                    {readouts.map((item) => (
                                        <Readout
                                            key={item.label}
                                            label={item.label}
                                            suffix={item.suffix}
                                            value={readoutValue(item.value, state)}
                                        />
                                    ))}
                                </div>
                                {legend}
                            </div>
                        ) : null}
                        <div className={cn(state === "refetching" && "opacity-45")}>{children}</div>
                    </>
                )}
            </div>
        </section>
    );
}

function readoutValue(value: string, state: ChartState): ReactNode {
    if (state === "loading") return <Skeleton width={Math.max(16, value.length * 6)} height={10} />;
    if (state === "empty") return "—";
    return value;
}
