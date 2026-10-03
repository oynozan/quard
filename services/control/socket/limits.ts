// What one SDK connection may hold at once
export const CONNECTION_LIMITS = {
    // Past this many unhandled messages control stops reading the socket
    pause: 200,
    // and reads again once the queue is down to this
    resume: 50,
    // Calls waiting for a human
    waiters: 1000,
} as const;
