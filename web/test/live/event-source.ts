import { vi } from "vitest";

// A stand-in for the browser's EventSource that tests drive by hand
export class FakeEventSource {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 2;
    static all: FakeEventSource[] = [];

    readyState = FakeEventSource.CONNECTING;
    onopen: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    private listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();

    constructor(readonly url: string) {
        FakeEventSource.all.push(this);
    }

    addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }

    close = vi.fn(() => {
        this.readyState = FakeEventSource.CLOSED;
    });

    open() {
        this.readyState = FakeEventSource.OPEN;
        this.onopen?.(new Event("open"));
    }

    // A dropped stream reconnects by itself; a refused one stays closed
    fail(closed = false) {
        this.readyState = closed ? FakeEventSource.CLOSED : FakeEventSource.CONNECTING;
        this.onerror?.(new Event("error"));
    }

    emit(type: string, data: string) {
        for (const listener of this.listeners.get(type) ?? []) listener(new MessageEvent(type, { data }));
    }
}

// The newest stream the page opened
export function lastSource(): FakeEventSource {
    return FakeEventSource.all[FakeEventSource.all.length - 1];
}

export function stubEventSource() {
    FakeEventSource.all = [];
    vi.stubGlobal("EventSource", FakeEventSource);
}
