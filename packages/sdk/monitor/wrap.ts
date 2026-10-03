import { createMonitorFetch, type Fetch } from "./fetch.ts";

type Wrappable<T> = {
    withOptions(options: { fetch: Fetch }): T;
};

// Clients that already send their requests through the monitor
const wrapped = new WeakSet<object>();

// Returns a copy of the client whose requests go through the monitor.
// A wrapped client comes back as it is, so no call is recorded twice.
export function wrap<T extends Wrappable<T>>(client: T): T {
    if (wrapped.has(client)) {
        return client;
    }
    const inner = (client as unknown as { fetch?: Fetch }).fetch ?? globalThis.fetch;
    const copy = client.withOptions({ fetch: createMonitorFetch(inner) });
    wrapped.add(copy);
    return copy;
}
