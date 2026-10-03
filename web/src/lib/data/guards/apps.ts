import { NOW, MINUTE, HOUR, DAY } from "../rng";

// One app running the Quard SDK. On connect it sends its agents and its active rules hash.
export type SdkApp = {
    name: string;
    agents: string[];
    keyId: string;
    sdkVersion: string;
    runtime: string;
    rulesHash: string;
    // The hash before the last deploy, and when it changed.
    previousHash: string | null;
    hashSince: number;
    connectedAt: number;
    lastSeenAt: number;
    state: "connected" | "offline";
};

export const SDK_APPS: SdkApp[] = [
    {
        name: "orchestrator-app",
        agents: ["orchestrator", "researcher"],
        keyId: "key_2c8e",
        sdkVersion: "quard 0.4.2",
        runtime: "Node 24.9.0",
        rulesHash: "e9d17c2a5b08",
        previousHash: "a3f60b9d2e14",
        hashSince: NOW - 6 * DAY - 5 * HOUR,
        connectedAt: NOW - 2 * DAY - 3 * HOUR,
        lastSeenAt: NOW - 4_000,
        state: "connected",
    },
    {
        name: "billing-service",
        agents: ["billing"],
        keyId: "key_7f31",
        sdkVersion: "quard 0.4.2",
        runtime: "Node 24.9.0",
        rulesHash: "3f9a0c7d1e24",
        previousHash: "c81e4f0a9b37",
        hashSince: NOW - 3 * DAY - 2 * HOUR,
        connectedAt: NOW - 3 * DAY - 2 * HOUR,
        lastSeenAt: NOW - 12_000,
        state: "connected",
    },
    {
        name: "support-app",
        agents: ["support", "inbox-triage"],
        keyId: "key_a40d",
        sdkVersion: "quard 0.4.1",
        runtime: "Node 22.14.0",
        rulesHash: "b5e81d06c3a9",
        previousHash: "7a2c94e0f1d3",
        hashSince: NOW - 20 * HOUR,
        connectedAt: NOW - 20 * HOUR,
        lastSeenAt: NOW - 31_000,
        state: "connected",
    },
    {
        name: "deploy-runner",
        agents: ["deploy-bot"],
        keyId: "key_91be",
        sdkVersion: "quard 0.4.0",
        runtime: "Node 24.6.0",
        rulesHash: "0c6f3b9e2a71",
        previousHash: null,
        hashSince: NOW - 24 * DAY,
        connectedAt: NOW - 9 * DAY,
        lastSeenAt: NOW - 47 * MINUTE,
        state: "offline",
    },
];

export function appOf(agent: string): SdkApp {
    return SDK_APPS.find((app) => app.agents.includes(agent)) ?? SDK_APPS[0];
}

// The rules hash a decision recorded at that time.
export function rulesHashAt(agent: string, time: number): string {
    const app = appOf(agent);
    return time < app.hashSince && app.previousHash ? app.previousHash : app.rulesHash;
}
