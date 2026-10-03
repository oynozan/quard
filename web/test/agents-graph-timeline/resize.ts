import { act } from "@testing-library/react";
import { vi } from "vitest";

// jsdom has no ResizeObserver; this fake reports widths on demand
const observers: FakeResizeObserver[] = [];

class FakeResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {
        observers.push(this);
    }
    observe() {}
    disconnect() {}
    resize(width: number) {
        const entry = { contentRect: { width } } as ResizeObserverEntry;
        act(() => this.callback([entry], this as unknown as ResizeObserver));
    }
}

// Installs the fake; undo with vi.unstubAllGlobals
export function stubResizeObserver() {
    observers.length = 0;
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
}

// Gives every watched container the same width
export function resizeAll(width: number) {
    for (const observer of observers) observer.resize(width);
}
