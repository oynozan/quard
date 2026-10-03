"use client";

import { useState } from "react";
import { ChartPane } from "@/components/charts/chart-pane";
import { useFitWidth } from "@/components/charts/hooks/use-fit-width";
import { EmptyLine } from "@/components/kit/empty";
import { Pane } from "@/components/kit/pane";
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
    const stepWord = (count: number) => (count === 1 ? "step" : "steps");
    const base = `Timeline of ${steps.length} ${stepWord(steps.length)} across ${lanes.length} ${lanes.length === 1 ? "agent" : "agents"}, colored by context label.`;
    if (!first) return `${base} Every step ran on trusted context.`;
    return `${base} Context turned untrusted at step ${steps.indexOf(first) + 1} (${first.name}, ${first.agent}); ${untrusted.length} ${stepWord(untrusted.length)} ran on untrusted context.`;
}

// One lane per agent and one cell per step that opens in the drawer
export function RunTimeline(props: RunTimelineProps) {
    if (props.steps.length === 0) {
        return (
            <Pane title="Timeline">
                <EmptyLine inset>No steps yet</EmptyLine>
            </Pane>
        );
    }
    return <StepTimeline {...props} />;
}

function StepTimeline({ steps, lanes, startedAt, initialStep }: RunTimelineProps) {
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
                    <TimelineField
                        steps={steps}
                        lanes={lanes}
                        startedAt={startedAt}
                        width={width}
                        summary={timelineSummary(steps, lanes)}
                        selected={selected}
                        onOpen={setSelected}
                    />
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
