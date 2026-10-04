"use client";

import type { ReplayRequest } from "@quard/db";
import { useTransition } from "react";
import { LiquidMetalButton } from "@/components/liquid-metal/liquid-metal-button";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import { replayIncident } from "@/lib/data/incidents/actions";
import type { ReplayStatus } from "@/lib/data/types";

type Props = { id: string; status: ReplayStatus; found: boolean; findFailed?: boolean };

// Why a replay can't start from here
const LOCKED: Partial<Record<ReplayStatus, string>> = {
    confirmed: "The replay already has an answer",
    "not confirmed": "The replay already has an answer",
    "could not reproduce": "The replay already has an answer",
    limited: "Replay can't run for this incident",
};

const ANSWER: Record<ReplayRequest, string> = {
    started: "Replay started. Rounds show here as they finish",
    running: "The replay is already running",
    decided: "The replay already has an answer",
    not_ready: "Replay starts once the verdict is found",
    not_found: "This incident no longer exists",
};

// The page's main action. The liquid-metal button is used once, here.
export function ReplayButton({ id, status, found, findFailed = false }: Props) {
    const [pending, startTransition] = useTransition();
    if (status === "running" || pending) {
        return (
            <Button busy className="h-[46px] min-w-[142px]">
                Replaying…
            </Button>
        );
    }
    const capped = status === "cap reached";
    const waiting = findFailed ? "Replay can't run: the root cause was not found" : ANSWER.not_ready;
    const reason = found ? (LOCKED[status] ?? null) : waiting;
    const start = () =>
        startTransition(async () => {
            try {
                showToast(ANSWER[await replayIncident(id, { raiseCap: capped })], "incident-replay");
            } catch {
                showToast("Could not start the replay", "incident-replay");
            }
        });
    return (
        <LiquidMetalButton
            label={capped ? "Continue with $5 more" : "Replay"}
            className={capped ? "w-[190px]" : undefined}
            onClick={start}
            disabled={reason !== null}
            title={reason ?? "Rerun the turning-point call 5 times with and 5 without the content, round by round"}
        />
    );
}
