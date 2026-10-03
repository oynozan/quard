import type { SdkConnection } from "@/lib/data/settings";
import { HOUR, NOW } from "../time";

// A connected app and one that went offline two hours ago
export const SDKS: SdkConnection[] = [
    {
        id: "key-orchestrator",
        name: "orchestrator-app",
        host: "web-1",
        sdkVersion: "0.4.2",
        key: "qk_live_2c8e",
        rulesHash: "e9d17c2a5b08f1d3",
        lastSeenAt: NOW - 4_000,
        state: "connected",
    },
    {
        id: "key-deploy",
        name: "deploy-runner",
        host: "ci-runner-3",
        sdkVersion: "0.4.1",
        key: "qk_live_91be",
        rulesHash: "0c6f3b9e2a71c4d5",
        lastSeenAt: NOW - 2 * HOUR,
        state: "offline",
    },
];
