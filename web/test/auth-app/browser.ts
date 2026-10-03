import { vi } from "vitest";

// jsdom has no ResizeObserver; charts keep the width they start with
class StillObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

// Stubs what the charts need from the browser. Reduced motion keeps them still.
export function stubBrowser() {
    vi.stubGlobal("ResizeObserver", StillObserver);
    vi.stubGlobal("matchMedia", (query: string) => ({
        matches: true,
        media: query,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
    }));
}
