import type { SdkConnection } from "@/lib/data/settings";
import { DAY, HOUR, NOW } from "../time";

// A connected app whose rules changed six days ago, and an offline one
export const SDKS: SdkConnection[] = [
    {
        name: "orchestrator-app",
        agents: ["orchestrator", "researcher"],
        sdkVersion: "quard 0.4.2",
        runtime: "Node 24.9.0",
        key: "qk_live_2c8e…",
        rulesHash: "e9d17c2a5b08",
        previousHash: "a3f60b9d2e14",
        hashSince: NOW - 6 * DAY - 5 * HOUR,
        lastSeenAt: NOW - 4_000,
        state: "connected",
    },
    {
        name: "deploy-runner",
        agents: ["deploy-bot"],
        sdkVersion: "quard 0.4.1",
        runtime: "Node 22.12.0",
        key: "qk_live_91be…",
        rulesHash: "0c6f3b9e2a71",
        previousHash: null,
        hashSince: NOW - 24 * DAY,
        lastSeenAt: NOW - 2 * HOUR,
        state: "offline",
    },
];
