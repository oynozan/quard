import { createMonitorFetch, isMonitorFetch, type Fetch } from "./fetch.ts";

type Wrappable<T> = {
    withOptions(options: { fetch: Fetch }): T;
};

// Returns a copy of the client whose requests go through the monitor.
// A client that already does, wrapped or copied from one, comes back
// as it is, so no call is recorded twice.
export function wrap<T extends Wrappable<T>>(client: T): T {
    const current = (client as unknown as { fetch?: Fetch }).fetch;
    if (isMonitorFetch(current)) {
        return client;
    }
    return client.withOptions({ fetch: createMonitorFetch(current ?? globalThis.fetch) });
}
