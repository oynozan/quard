"use client";

import { LiveMark } from "@/components/charts/chart-parts";
import { useLive } from "./status";

// The live square, hollow while the event stream is down
export function LiveSign() {
    return <LiveMark live={useLive()} />;
}

// The blinking cursor cell that ends a live log; gone while the stream is down
export function LiveCursor() {
    return useLive() ? <span aria-hidden className="cursor-blink mt-1 block h-[10px] w-1 bg-signal" /> : null;
}
