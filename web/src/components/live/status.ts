"use client";

import { createContext, useContext } from "react";

// "connecting" until the stream first opens, "offline" while it is down
export type LiveStatus = "connecting" | "live" | "offline";

const LiveStatusContext = createContext<LiveStatus>("connecting");

export const LiveStatusProvider = LiveStatusContext.Provider;

export function useLiveStatus(): LiveStatus {
    return useContext(LiveStatusContext);
}

// Only a dropped stream counts as not live, so nothing flickers on load
export function useLive(): boolean {
    return useLiveStatus() !== "offline";
}
