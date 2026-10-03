import type { RunDetail } from "@/lib/data/runs/types";
import { RunCallout, waitingStep } from "./run-callout";
import { RunGraph } from "./run-graph";
import { RunHeading } from "./run-heading";
import { RunLimits } from "./run-limits";
import { RunSummary, type Observed } from "./run-summary";
import { treeOrder } from "./lib/tree";
import { RunTimeline } from "./timeline/run-timeline";

function observedOf(run: RunDetail): Observed {
    const observed = { wouldBlock: 0, wouldAsk: 0 };
    for (const { guard } of run.steps) {
        if (guard?.mode !== "observe") continue;
        if (guard.outcome === "block") observed.wouldBlock += 1;
        if (guard.outcome === "ask") observed.wouldAsk += 1;
    }
    return observed;
}

// The whole run page body. The page only loads the run and hands it here.
export function RunView({ run, step }: { run: RunDetail; step?: string }) {
    const { summary } = run;
    const open = summary.status === "running" || summary.status === "waiting";
    // The callout already links to a waiting approval, so the heading does not repeat it.
    const waiting = Boolean(waitingStep(run));
    return (
        <>
            <RunHeading run={summary} open={open} showApproval={!waiting} />
            <RunCallout run={run} />
            <div className="reveal">
                <RunSummary run={summary} observed={observedOf(run)} />
            </div>
            <div className="reveal mt-7 max-[760px]:mt-[22px]" style={{ animationDelay: "60ms" }}>
                <RunTimeline
                    steps={run.steps}
                    lanes={treeOrder(run.agents)}
                    startedAt={summary.startedAt}
                    initialStep={step}
                />
            </div>
            <div
                className="reveal mt-7 grid grid-cols-[minmax(0,1fr)_268px] items-start gap-7 max-[1180px]:grid-cols-[minmax(0,1fr)_232px] max-[1180px]:gap-[22px] max-[980px]:grid-cols-1 max-[760px]:mt-[22px]"
                style={{ animationDelay: "120ms" }}
            >
                <RunGraph graph={run.graph} startedAt={summary.startedAt} />
                <RunLimits limits={run.limits} />
            </div>
        </>
    );
}
