import type { Registry } from "./registry.ts";

// Pings every connection, and drops one that did not answer the last ping
export function startPings(registry: Registry, ms: number): () => void {
    const timer = setInterval(() => {
        for (const connection of registry.connections()) {
            if (!connection.alive) {
                connection.socket.terminate();
                continue;
            }
            connection.alive = false;
            connection.socket.ping();
        }
    }, ms);
    timer.unref();
    return () => clearInterval(timer);
}
