// How often control does its background work, shorter in tests
export type ControlTiming = {
    // The first message must arrive within this
    helloMs: number;
    // A connection that did not answer the last ping by the next one is dropped
    pingMs: number;
    // The fallback check for dashboard decisions that a notification missed
    decisionMs: number;
    // Reloads the quarantine list of every project with connections
    fleetMs: number;
    // Closes connections whose agent key was revoked
    keyMs: number;
    // The first wait before listening again, doubling up to relistenMaxMs
    relistenMs: number;
    relistenMaxMs: number;
    // How long shutdown waits for sockets to close before dropping them
    closeMs: number;
};

export const CONTROL_TIMING: ControlTiming = {
    helloMs: 10_000,
    pingMs: 30_000,
    decisionMs: 1_000,
    fleetMs: 10_000,
    keyMs: 30_000,
    relistenMs: 1_000,
    relistenMaxMs: 30_000,
    closeMs: 2_000,
};
