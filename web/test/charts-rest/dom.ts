import { act } from "@testing-library/react";

// jsdom has no ResizeObserver; this fake reports widths on demand
export const observers: FakeResizeObserver[] = [];

export class FakeResizeObserver {
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

// Resizes every watched container at once
export function resizeAll(width: number) {
    for (const observer of observers) observer.resize(width);
}

// Each cell is one "M" move in a path
export function cellCount(path: Element | null): number {
    return (path?.getAttribute("d")?.match(/M/g) ?? []).length;
}

// The path drawn in a given fill, inside a container
export function pathByFill(container: Element, fill: string): Element | null {
    return container.querySelector(`path[fill="${fill}"]`);
}
