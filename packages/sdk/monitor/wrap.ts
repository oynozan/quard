import { createMonitorFetch, type Fetch } from "./fetch.ts";

type Wrappable<T> = {
    withOptions(options: { fetch: Fetch }): T;
};

// Returns a copy of the client whose requests go through the monitor
export function wrap<T extends Wrappable<T>>(client: T): T {
    const inner = (client as unknown as { fetch?: Fetch }).fetch ?? globalThis.fetch;
    return client.withOptions({ fetch: createMonitorFetch(inner) });
}
