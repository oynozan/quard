"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { ChartTooltip } from "@/components/charts/chart-parts";
import { ringPath } from "@/components/charts/layout/heatmap";
import type { Step } from "@/lib/data/runs/types";
import { cn } from "@/lib/utils";
import { CONTEXTS, contextStyle } from "../lib/context";
import { KIND_WORD, MARK_WORD, decisionWord, formatOffset, stepMark, type MarkKind } from "../lib/words";
import { axisColumns, nearestInLane, timelineLayout } from "./layout";

const MARK_FILL: Record<MarkKind, string> = {
    block: "var(--danger)",
    ask: "var(--warning)",
    "would-block": "var(--danger)",
    "would-ask": "var(--warning)",
};

type TimelineFieldProps = {
    steps: Step[];
    lanes: string[];
    startedAt: number;
    width: number;
    summary: string;
    selected: number | null;
    onOpen: (index: number) => void;
};

export function stepSentence(step: Step, index: number, total: number, startedAt: number): string {
    const parts = [
        `Step ${index + 1} of ${total}`,
        step.name,
        `${KIND_WORD[step.kind].toLowerCase()} by ${step.agent}`,
        `at ${formatOffset(step.startedAt - startedAt)}`,
        `${contextStyle(step.context).word.toLowerCase()} context`,
    ];
    if (step.guard) parts.push(decisionWord(step.guard).toLowerCase());
    else if (step.status !== "ok") parts.push(step.status);
    return parts.join(", ");
}

// The lanes and cells. Hover or arrows move a ring; Enter or a click opens the step.
export function TimelineField({ steps, lanes, startedAt, width, summary, selected, onOpen }: TimelineFieldProps) {
    const [hover, setHover] = useState<number | null>(null);
    const labelWidth = width < 520 ? 76 : 112;
    const layout = useMemo(() => timelineLayout(steps, lanes, width - labelWidth), [steps, lanes, width, labelWidth]);
    const { cell, pitch } = layout;
    const offsetOf = (i: number) => formatOffset(steps[i].startedAt - startedAt);
    const axis = axisColumns(steps.length, pitch).filter(
        (col, i, cols) => i === 0 || offsetOf(col) !== offsetOf(cols[i - 1]),
    );
    const active = hover ?? selected;
    const step = active !== null ? steps[active] : null;
    const activeLane = active !== null ? layout.laneOf[active] : null;

    function onKeyDown(event: KeyboardEvent) {
        if (steps.length === 0) return;
        const last = steps.length - 1;
        const from = hover ?? selected;
        const lane = from !== null ? layout.laneOf[from] : 0;
        let next: number | null = null;
        if (event.key === "Escape") return setHover(null);
        if ((event.key === "Enter" || event.key === " ") && from !== null) {
            event.preventDefault();
            return onOpen(from);
        }
        if (event.key === "ArrowLeft") next = from === null ? 0 : Math.max(0, from - 1);
        if (event.key === "ArrowRight") next = from === null ? 0 : Math.min(last, from + 1);
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = last;
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            const target = lane + (event.key === "ArrowUp" ? -1 : 1);
            next = from === null ? 0 : (nearestInLane(layout.laneOf, from, target) ?? from);
        }
        if (next === null) return;
        event.preventDefault();
        setHover(next);
    }

    const right = active !== null && active * pitch > layout.width / 2;
    const style = step ? contextStyle(step.context) : null;
    const mark = step ? stepMark(step) : null;

    return (
        <div className={layout.width + labelWidth > width ? "table-scroll pb-2" : undefined}>
            <div className="flex w-max min-w-full">
                <div aria-hidden className="relative shrink-0" style={{ width: labelWidth - 10, marginRight: 10 }}>
                    {lanes.map((lane, i) => (
                        <span
                            key={lane}
                            title={lane}
                            className={cn(
                                "mono absolute right-0 left-0 truncate text-right text-[11px] leading-[11px]",
                                activeLane === i ? "text-ink" : "text-ink-muted",
                            )}
                            style={{ top: layout.laneTop(i) + Math.floor((cell - 11) / 2) }}
                        >
                            {lane}
                        </span>
                    ))}
                </div>

                <div className="relative" style={{ width: layout.width }}>
                    <svg
                        role="img"
                        aria-label={`${summary} Use the arrow keys to move between steps and Enter to open one.`}
                        tabIndex={0}
                        width={layout.width}
                        height={layout.height}
                        shapeRendering="crispEdges"
                        overflow="visible"
                        className="block cursor-pointer outline-offset-[6px] focus-visible:outline-2 focus-visible:outline-signal"
                        onPointerMove={(event) => {
                            const box = event.currentTarget.getBoundingClientRect();
                            const col = Math.floor((event.clientX - box.left) / pitch);
                            setHover(Math.min(steps.length - 1, Math.max(0, col)));
                        }}
                        onPointerLeave={() => setHover(null)}
                        onClick={() => (hover !== null ? onOpen(hover) : undefined)}
                        onKeyDown={onKeyDown}
                        onFocus={() => setHover((current) => current ?? selected ?? 0)}
                        onBlur={() => setHover(null)}
                    >
                        <path d={layout.field} fill="var(--chart-field)" />
                        {layout.links.map((link, i) => (
                            <path
                                key={i}
                                d={link.d}
                                fill={link.untrusted ? "var(--caution-text)" : "var(--ink-subtle)"}
                            />
                        ))}
                        {layout.fills.map((fill) =>
                            fill.d ? (
                                <path key={fill.key} d={fill.d} fill={CONTEXTS.find((c) => c.key === fill.key)?.fill} />
                            ) : null,
                        )}
                        <path d={layout.holes} fill="var(--page)" />
                        {layout.marks.map((m) => (
                            <path key={m.kind} d={m.d} fill={MARK_FILL[m.kind]} />
                        ))}
                        {active !== null ? <path d={ringPath(layout.cellRect(active))} fill="var(--ink)" /> : null}
                    </svg>

                    <div
                        aria-hidden
                        className="mono relative mt-[10px] h-[10px] text-[10px] leading-[10px] text-ink-muted"
                    >
                        {axis.map((col) => (
                            <span
                                key={col}
                                className="absolute whitespace-nowrap"
                                style={{
                                    ...(col === steps.length - 1 && col > 0 ? { right: 0 } : { left: col * pitch }),
                                    opacity: active !== null && Math.abs(active - col) * pitch < 56 ? 0 : 1,
                                }}
                            >
                                {formatOffset(steps[col].startedAt - startedAt)}
                            </span>
                        ))}
                        {step && active !== null ? (
                            <span
                                className="absolute whitespace-nowrap text-ink"
                                style={
                                    right
                                        ? { right: `calc(100% - ${active * pitch + cell}px)` }
                                        : { left: active * pitch }
                                }
                            >
                                {formatOffset(step.startedAt - startedAt)}
                            </span>
                        ) : null}
                    </div>

                    {step && style && active !== null ? (
                        <ChartTooltip
                            x={active * pitch + (right ? -10 : cell + 10)}
                            y={Math.max(0, layout.laneTop(layout.laneOf[active]) - 10)}
                            alignRight={right}
                            value={step.name}
                            unit={KIND_WORD[step.kind].toLowerCase()}
                            caption={[
                                step.agent,
                                style.word.toLowerCase(),
                                step.guard
                                    ? decisionWord(step.guard).toLowerCase()
                                    : mark
                                      ? MARK_WORD[mark].toLowerCase()
                                      : null,
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                            keyColor={style.fill}
                        />
                    ) : null}
                </div>
            </div>
            <p className="sr-only" aria-live="polite">
                {hover !== null ? stepSentence(steps[hover], hover, steps.length, startedAt) : ""}
            </p>
        </div>
    );
}
