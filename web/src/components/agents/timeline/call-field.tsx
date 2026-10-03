"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { ChartTooltip } from "@/components/charts/chart-parts";
import { useCursor } from "@/components/charts/hooks/use-cursor";
import { useFitWidth } from "@/components/charts/hooks/use-fit-width";
import type { AgentCall } from "@/lib/data/agents";
import { formatClock, shortId } from "@/lib/format";
import { cn } from "@/lib/utils";
import { contextStyle } from "@/components/runs/detail/lib/context";
import { fitTimeline, KIND_WORD, lanesFor, markColor, markOf, MARK_WORD, type MarkKind } from "./lanes";

const MARK_ROW = 12;

function rect(x: number, y: number, w: number, h: number): string {
    return `M${x} ${y}h${w}v${h}h${-w}Z`;
}

// Calls as columns, one lane per kind, each lit cell colored by the call's context label
export function CallField({ calls, summary }: { calls: AgentCall[]; summary: string }) {
    const router = useRouter();
    const id = useId().replace(/:/g, "");
    const [ref, width] = useFitWidth<HTMLDivElement>(900);
    const oldestFirst = useMemo(() => [...calls].reverse(), [calls]);
    const fit = fitTimeline(width, oldestFirst.length);
    const shown = useMemo(() => oldestFirst.slice(oldestFirst.length - fit.shown), [oldestFirst, fit.shown]);
    const lanes = useMemo(() => lanesFor(shown), [shown]);
    const cursor = useCursor(shown.length, "last");
    const [pointer, setPointer] = useState<number | null>(null);
    const active = cursor.index ?? pointer;
    const fieldHeight = lanes.length * fit.rowHeight + MARK_ROW;

    const paths = useMemo(() => {
        const fills = new Map<string, string>();
        const add = (key: string, d: string) => fills.set(key, (fills.get(key) ?? "") + d);
        const marks: { kind: MarkKind; d: string }[] = [];
        shown.forEach((call, i) => {
            const x = i * fit.pitch;
            const hot = i === active;
            lanes.forEach((lane, r) => {
                const y = r * fit.rowHeight + Math.floor((fit.rowHeight - fit.cell) / 2);
                const cell = rect(x, y, fit.cell, fit.cell);
                if (!lane.kinds.includes(call.kind)) return add(hot ? "var(--highlight)" : "var(--chart-field)", cell);
                const style = contextStyle(call.context);
                add(hot ? "var(--mint)" : style.fill, cell);
                if (style.untrusted && fit.cell >= 6) {
                    const h = Math.floor(fit.cell / 2) - 1;
                    add("var(--page)", rect(x + h, y + h, 2, 2));
                }
            });
            const mark = markOf(call);
            if (mark) marks.push({ kind: mark, d: rect(x, lanes.length * fit.rowHeight + 4, fit.cell, 5) });
        });
        return { fills: [...fills.entries()], marks };
    }, [shown, lanes, fit.pitch, fit.cell, fit.rowHeight, active]);

    const call = active !== null ? shown[active] : null;

    function columnAt(event: MouseEvent<HTMLDivElement>) {
        const box = event.currentTarget.getBoundingClientRect();
        const i = Math.floor((event.clientX - box.left) / fit.pitch);
        return i >= 0 && i < shown.length ? i : null;
    }

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === "Enter" && call) return router.push(`/runs/${call.runId}`);
        cursor.onKeyDown(event);
    }

    const tipX = active !== null ? fit.labelWidth + active * fit.pitch + fit.cell / 2 : 0;
    const describe = (c: AgentCall) => {
        const mark = markOf(c);
        return `${KIND_WORD[c.kind]} ${c.name} at ${formatClock(c.at, true)}, ${contextStyle(c.context).word.toLowerCase()} context${mark ? `, ${MARK_WORD[mark].toLowerCase()}` : ""}, run ${shortId(c.runId)}`;
    };

    return (
        <div ref={ref} className="relative">
            <div className="flex">
                <ul aria-hidden className="shrink-0" style={{ width: fit.labelWidth }}>
                    {lanes.map((lane) => (
                        <li
                            key={lane.key}
                            className="truncate pr-3 text-right text-[11px] font-light text-ink-muted"
                            style={{ height: fit.rowHeight, lineHeight: `${fit.rowHeight}px` }}
                        >
                            {width < 560 ? lane.short : lane.word}
                        </li>
                    ))}
                </ul>
                <div
                    role="img"
                    tabIndex={0}
                    aria-label={summary}
                    aria-describedby={`${id}-keys`}
                    onKeyDown={onKeyDown}
                    onBlur={cursor.clear}
                    onMouseMove={(event) => setPointer(columnAt(event))}
                    onMouseLeave={() => setPointer(null)}
                    onClick={(event) => {
                        const i = columnAt(event);
                        if (i !== null) router.push(`/runs/${shown[i].runId}`);
                    }}
                    className={cn("min-w-0 flex-1", call && "cursor-pointer")}
                >
                    <svg
                        aria-hidden
                        width={shown.length * fit.pitch}
                        height={fieldHeight}
                        shapeRendering="crispEdges"
                        className="block"
                    >
                        {paths.fills.map(([fill, d]) => (
                            <path key={fill} d={d} fill={fill} />
                        ))}
                        {paths.marks.map((mark, i) =>
                            mark.kind.startsWith("would") ? (
                                <path key={i} d={mark.d} fill="none" stroke={markColor(mark.kind)} />
                            ) : (
                                <path key={i} d={mark.d} fill={markColor(mark.kind)} />
                            ),
                        )}
                    </svg>
                </div>
            </div>
            {shown.length ? (
                <div
                    className="mono mt-[7px] flex justify-between text-[11px] text-ink-muted"
                    style={{ marginLeft: fit.labelWidth, width: shown.length * fit.pitch }}
                >
                    <span>{formatClock(shown[0].at, true)}</span>
                    <span>{formatClock(shown[shown.length - 1].at, true)}</span>
                </div>
            ) : null}
            {call ? (
                <ChartTooltip
                    x={tipX > width / 2 ? tipX - 10 : tipX + 10}
                    y={fieldHeight + 4}
                    alignRight={tipX > width / 2}
                    value={call.name}
                    unit={KIND_WORD[call.kind].toLowerCase()}
                    caption={`${formatClock(call.at, true)} · ${contextStyle(call.context).word} · run ${shortId(call.runId)}`}
                    keyColor={contextStyle(call.context).fill}
                />
            ) : null}
            <p id={`${id}-keys`} className="sr-only">
                Use the left and right arrow keys to step through calls. Press Enter to open the call&apos;s run.
            </p>
            <p className="sr-only" aria-live="polite">
                {call ? describe(call) : ""}
            </p>
        </div>
    );
}
