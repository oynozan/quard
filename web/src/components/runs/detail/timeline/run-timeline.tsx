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
    const base = `Timeline of ${steps.length} steps across ${lanes.length} ${lanes.length === 1 ? "agent" : "agents"}, colored by context label.`;
    if (!first) return `${base} Every step ran on trusted context.`;
    return `${base} Context turned untrusted at step ${steps.indexOf(first) + 1} (${first.name}, ${first.agent}); ${untrusted.length} steps ran on untrusted context.`;
}

// One lane per agent, one cell per step. A step opens in the drawer.
export function RunTimeline({ steps, lanes, startedAt, initialStep }: RunTimelineProps) {
    const [ref, width] = useFitWidth<HTMLDivElement>(900);
    const [selected, setSelected] = useState<number | null>(() => {
        const index = initialStep ? steps.findIndex((step) => step.id === initialStep) : -1;
        return index >= 0 ? index : null;
    });
    const untrusted = steps.filter((step) => step.context.trust === "untrusted").length;
    const summary = timelineSummary(steps, lanes);
    const state = steps.length === 0 ? "empty" : "ready";

    return (
        <>
            <ChartPane
                title="Timeline"
                state={state}
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
                        <p className="py-10 text-center text-[11px] font-light text-ink-muted">
                            This run has no steps yet
                        </p>
                    ) : (
                        <TimelineField
                            steps={steps}
                            lanes={lanes}
                            startedAt={startedAt}
                            width={width}
                            summary={summary}
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
