import { createRng, seedFrom, NOW, MINUTE, HOUR } from "../../rng";

export type RunPlan = {
    id: string;
    root: string;
    startedAt: number;
    // How the run ends unless NOW cuts it first.
    ending: "completed" | "failed" | "blocked";
    // Runs from the last half hour never ask a human: nobody has answered them yet.
    canAsk: boolean;
};

const ROOTS: [string, number][] = [
    ["orchestrator", 0.34],
    ["support", 0.26],
    ["inbox-triage", 0.16],
    ["billing", 0.16],
    ["deploy-bot", 0.08],
];

// deploy-runner lost its connection 47 minutes ago, so newer runs never start there.
const DEPLOY_OFFLINE_SINCE = NOW - 50 * MINUTE;

export function planFor(id: string, startedAt: number): RunPlan {
    const rng = createRng(seedFrom(`plan:${id}`));
    let roll = rng();
    let root = ROOTS[ROOTS.length - 1][0];
    for (const [name, weight] of ROOTS) {
        if (roll < weight) {
            root = name;
            break;
        }
        roll -= weight;
    }
    if (root === "deploy-bot" && startedAt > DEPLOY_OFFLINE_SINCE) root = "orchestrator";
    const end = rng();
    return {
        id,
        root,
        startedAt,
        ending: end < 0.04 ? "blocked" : end < 0.08 ? "failed" : "completed",
        canAsk: startedAt < NOW - 30 * MINUTE,
    };
}

// A run nobody listed. Its start comes from its id: between 7 hours and 23 days ago.
export function planFromId(id: string): RunPlan {
    const minutes = seedFrom(`start:${id}`) % (23 * 24 * 60 - 7 * 60);
    return planFor(id, NOW - 7 * HOUR - minutes * MINUTE);
}
