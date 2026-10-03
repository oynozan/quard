"use client";

import { useState } from "react";
import { ChartPane } from "@/components/charts/chart-pane";
import { useFitWidth } from "@/components/charts/hooks/use-fit-width";
import type { Step } from "@/lib/data/runs/types";
import { formatInt } from "@/lib/format";
import { StepDrawer } from "../drawer/step-drawer";
import { TimelineField } from "./timeline-field";
import { TimelineLegend } from "./legend";
import { StepTable } from "./step-table";

const NO_STEPS = "No steps yet";

type RunTimelineProps = {
    steps: Step[];
    lanes: string[];
    startedAt: number;
    // Step id to open in the drawer on first render
    initialStep?: string;
};

function timelineSummary(steps: Step[], lanes: string[]): string {
    const untrusted = steps.filter((step) => step.context.trust === "untrusted");
    const first = untrusted[0];
    const stepWord = (count: number) => (count === 1 ? "step" : "steps");
    const base = `Timeline of ${steps.length} ${stepWord(steps.length)} across ${lanes.length} ${lanes.length === 1 ? "agent" : "agents"}, colored by context label.`;
    if (!first) return `${base} Every step ran on trusted context.`;
    return `${base} Context turned untrusted at step ${steps.indexOf(first) + 1} (${first.name}, ${first.agent}); ${untrusted.length} ${stepWord(untrusted.length)} ran on untrusted context.`;
}

// Each lane as an unlit band, with the sentence knocked out of the first one
function EmptyField({ lanes, width }: { lanes: string[]; width: number }) {
    const labelWidth = width < 520 ? 76 : 112;
    return (
        <div role="img" aria-label={NO_STEPS} className="flex flex-col gap-[18px]">
            {(lanes.length > 0 ? lanes : [""]).map((lane, i) => (
                <div key={lane} className="flex items-center">
                    <span
                        title={lane}
                        className="mono mr-[10px] shrink-0 truncate text-right text-[11px] leading-[11px] text-ink-muted"
                        style={{ width: labelWidth - 10 }}
                    >
                        {lane}
                    </span>
                    <span className="flex h-8 min-w-0 flex-1 justify-center bg-chart-field">
                        {i === 0 ? (
                            <span className="flex items-center bg-page px-3 text-[11px] whitespace-nowrap text-ink-muted">
                                {NO_STEPS}
                            </span>
                        ) : null}
                    </span>
                </div>
            ))}
        </div>
    );
}

// One lane per agent and one cell per step that opens in the drawer
export function RunTimeline({ steps, lanes, startedAt, initialStep }: RunTimelineProps) {
    const [ref, width] = useFitWidth<HTMLDivElement>(900);
    const [selected, setSelected] = useState<number | null>(() => {
        const index = initialStep ? steps.findIndex((step) => step.id === initialStep) : -1;
        return index >= 0 ? index : null;
    });
    const untrusted = steps.filter((step) => step.context.trust === "untrusted").length;

    return (
        <>
            <ChartPane
                title="Timeline"
                state={steps.length === 0 ? "empty" : "ready"}
                readouts={[
                    {
                        label: "Untrusted context",
                        value: formatInt(untrusted),
                        suffix: untrusted === 1 ? "step" : "steps",
                    },
                ]}
                table={
                    <StepTable
                        steps={steps}
                        startedAt={startedAt}
                        height={Math.max(260, lanes.length * 40 + 120)}
                        onOpen={setSelected}
                    />
                }
            >
                <div ref={ref}>
                    {steps.length === 0 ? (
                        <EmptyField lanes={lanes} width={width} />
                    ) : (
                        <TimelineField
                            steps={steps}
                            lanes={lanes}
                            startedAt={startedAt}
                            width={width}
                            summary={timelineSummary(steps, lanes)}
                            selected={selected}
                            onOpen={setSelected}
                        />
                    )}
                    <div className="mt-[18px] border-t border-line pt-3">
                        <TimelineLegend steps={steps} />
                    </div>
                </div>
            </ChartPane>
            <StepDrawer
                step={selected !== null ? (steps[selected] ?? null) : null}
                startedAt={startedAt}
                onClose={() => setSelected(null)}
            />
        </>
    );
}
