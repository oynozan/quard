"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { showToast } from "@/components/ui/toast";
import type { Replay } from "@/lib/data/incidents/types";
import { canReplay, nextRound } from "../lib/simulate";
import { REPLAY_WORD } from "../lib/labels";

// How long the demo round takes. A real round takes about a minute.
const ROUND_DEMO_MS = 3200;

type ReplayState = {
    replay: Replay;
    running: boolean;
    allowed: { ok: boolean; reason: string | null };
    start: () => void;
};

const ReplayContext = createContext<ReplayState | null>(null);

// Shares one replay between the page action and the results pane.
export function ReplayProvider({ initial, children }: { initial: Replay; children: ReactNode }) {
    const [replay, setReplay] = useState(initial);
    const [running, setRunning] = useState(false);
    const timer = useRef<number | null>(null);

    useEffect(
        () => () => {
            if (timer.current) window.clearTimeout(timer.current);
        },
        [],
    );

    const allowed = running ? { ok: false, reason: "A round is running now" } : canReplay(replay);

    const start = useCallback(() => {
        if (running || !canReplay(replay).ok) return;
        setRunning(true);
        timer.current = window.setTimeout(() => {
            const next = nextRound(replay);
            setReplay(next);
            setRunning(false);
            const word = next.status === "running" ? "Not decided yet" : REPLAY_WORD[next.status];
            showToast(`Round ${next.rounds.length} finished. ${word}`, "replay-round");
        }, ROUND_DEMO_MS);
    }, [replay, running]);

    return <ReplayContext.Provider value={{ replay, running, allowed, start }}>{children}</ReplayContext.Provider>;
}

export function useReplay(): ReplayState {
    const value = useContext(ReplayContext);
    if (!value) throw new Error("useReplay needs a ReplayProvider");
    return value;
}
