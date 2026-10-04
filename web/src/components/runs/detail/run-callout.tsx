import { approvalHref } from "@/components/approvals/lib/shown";
import { WarningRule } from "@/components/kit/feedback/feedback";
import { TextLink } from "@/components/kit/links";
import type { RunDetail, Step } from "@/lib/data/runs/types";
import { formatDuration } from "@/lib/format";

export function waitingStep(run: RunDetail): Step | undefined {
    return run.steps.find((step) => step.approval?.state === "waiting");
}

// The amber rule when a step is waiting for a human.
export function RunCallout({ run }: { run: RunDetail }) {
    const waiting = waitingStep(run);
    if (!waiting) return null;
    const approvalId = run.summary.approvalId;
    return (
        <WarningRule
            className="mb-[26px]"
            title={
                <>
                    <span className="mono">{waiting.name}</span> by <span className="mono">{waiting.agent}</span> is
                    waiting for a human · <span className="mono">{formatDuration(waiting.durationMs)}</span>
                    <TextLink href={approvalId ? approvalHref(approvalId) : "/approvals"} className="ml-3">
                        Review in Approvals
                    </TextLink>
                </>
            }
        />
    );
}
