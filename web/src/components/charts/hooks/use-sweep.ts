"use client";

import { useEffect, useState } from "react";
import { SWEEP_REACH } from "../layout/sweep";

const PERIOD = 1400;

// Eases like CSS ease-in-out, so the sweep starts and lands softly
function easeInOut(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// The loading sweep's center column, or null when idle or when motion is reduced
export function useSweep(columns: number, active: boolean): number | null {
    const [center, setCenter] = useState<number | null>(null);

    useEffect(() => {
        if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        let frame = 0;
        let last = Number.NaN;
        const start = performance.now();
        const tick = (now: number) => {
            const t = ((now - start) % PERIOD) / PERIOD;
            const next = Math.round(-SWEEP_REACH + easeInOut(t) * (columns + 2 * SWEEP_REACH));
            if (next !== last) {
                last = next;
                setCenter(next);
            }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [columns, active]);

    return active ? center : null;
}
