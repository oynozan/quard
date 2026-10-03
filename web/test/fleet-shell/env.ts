import { vi } from "vitest";

// jsdom has no ResizeObserver; charts keep their first width
class StillObserver {
    observe() {}
    disconnect() {}
}

// Stubs the browser APIs the charts need. Reduced motion stops the loading sweep.
export function stubBrowser() {
    vi.stubGlobal("ResizeObserver", StillObserver);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
}
