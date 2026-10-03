import { vi } from "vitest";

// jsdom has no ResizeObserver, so charts keep the width they start with
class StillObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

export function stubResizeObserver() {
    vi.stubGlobal("ResizeObserver", StillObserver);
}
