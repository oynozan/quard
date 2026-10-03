import { uniqueLabels } from "../labels/context";
import { NOW, MINUTE, SECOND } from "../rng";
import { catalogRun, type CatalogRun } from "../runs/catalog";
import {
    CONTOSO_ASKED_AT,
    CONTOSO_RUN_ID,
    DEPLOY_ASKED_AT,
    DEPLOY_RUN_ID,
    REFUND_RUN_ID,
} from "../runs/scripts/approval-runs";
import { STORY_RUN_ID } from "../runs/scripts/story";
import type { Step } from "../runs/types";
import type { ApprovalRequest } from "../types";
import type { Heartbeat } from "./types";

type OpenSpec = { id: string; runId: string; heartbeat: Heartbeat };

const BEAT = 15 * SECOND;

// Open requests and the run that first asked. Newest first.
const OPEN: OpenSpec[] = [
    {
        id: "apr_7f31",
        runId: STORY_RUN_ID,
        heartbeat: { state: "live", lastAt: NOW - 6 * SECOND, intervalMs: BEAT, stoppedReason: null },
    },
    {
        id: "apr_7f2c",
        runId: REFUND_RUN_ID,
        heartbeat: { state: "live", lastAt: NOW - 11 * SECOND, intervalMs: BEAT, stoppedReason: null },
    },
    {
        id: "apr_7f1e",
        runId: DEPLOY_RUN_ID,
        heartbeat: {
            state: "stopped",
            lastAt: DEPLOY_ASKED_AT + 5 * MINUTE,
            intervalMs: BEAT,
            stoppedReason: "Cloud Run ended the request at its 5-minute limit while the call waited",
        },
    },
    {
        id: "apr_7f0a",
        runId: CONTOSO_RUN_ID,
        heartbeat: {
            state: "stopped",
            lastAt: CONTOSO_ASKED_AT + 5 * MINUTE,
            intervalMs: BEAT,
            stoppedReason: "Vercel Functions stopped the call at its 300-second limit",
        },
    },
];

export type OpenCall = { spec: OpenSpec; run: CatalogRun; call: Step; approval: Step };

export function openIds(): string[] {
    return OPEN.map((spec) => spec.id);
}

// The call that opened a request, found in the run that asked first.
export function openCall(id: string): OpenCall | null {
    const spec = OPEN.find((item) => item.id === id);
    const run = spec ? catalogRun(spec.runId) : null;
    if (!spec || !run) return null;
    const approval = run.detail.steps.find((step) => step.approval?.requestId === id);
    const call = run.detail.steps.find((step) => step.id === approval?.parentId);
    return approval && call ? { spec, run, call, approval } : null;
}

// The request as the approver sees it. It keeps the full values until someone decides.
export function requestOf(open: OpenCall): ApprovalRequest {
    const raw = open.run.built.rawArgs.filter((arg) => arg.stepId === open.call.id);
    const asked = open.run.detail.steps.find(
        (step) => step.parentId === open.call.id && step.guard?.outcome === "ask" && step.guard.mode !== "observe",
    );
    return {
        id: open.spec.id,
        runId: open.spec.runId,
        stepId: open.call.id,
        agent: open.call.agent,
        tool: open.call.name,
        args: open.call.args.map((arg) => ({
            name: arg.name,
            value: raw.find((item) => item.name === arg.name)?.raw ?? arg.value,
            origins: uniqueLabels(arg.valueLabel.appearances.map((appearance) => appearance.label)),
            ...(arg.valueLabel.generated ? { generated: true } : {}),
            traced: arg.valueLabel.traced,
        })),
        reason: asked?.guard?.reason ?? `${open.call.name} asks a human first`,
        openedAt: open.approval.startedAt,
        waiting: open.spec.heartbeat.state === "live",
    };
}

// Open approval requests, newest first.
export function openApprovals(): ApprovalRequest[] {
    return OPEN.flatMap((spec) => {
        const open = openCall(spec.id);
        return open ? [requestOf(open)] : [];
    });
}
