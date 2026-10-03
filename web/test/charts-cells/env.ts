import { act } from "@testing-library/react";
import { vi } from "vitest";

// Browser APIs the cell charts need and jsdom lacks, driven by the test

const START = 1000;

class FakeObserver {
    static all: FakeObserver[] = [];
    constructor(private readonly callback: ResizeObserverCallback) {
        FakeObserver.all.push(this);
    }
    observe() {}
    disconnect() {}
    report(width: number) {
        const entry = { contentRect: { width } } as ResizeObserverEntry;
        this.callback([entry], this as unknown as ResizeObserver);
    }
}

const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;

export function stubChartEnv() {
    FakeObserver.all = [];
    frames.clear();
    nextFrame = 1;
    vi.stubGlobal("ResizeObserver", FakeObserver);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("requestAnimationFrame", (tick: FrameRequestCallback) => {
        frames.set(nextFrame, tick);
        return nextFrame++;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    vi.spyOn(performance, "now").mockReturnValue(START);
}

export function unstubChartEnv() {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
}

// Reports a new container width to every chart on the page
export function resizeTo(width: number) {
    act(() => FakeObserver.all.forEach((observer) => observer.report(width)));
}

// Runs the queued loading sweep frames at a time past the start, in ms
export function runFrame(elapsed: number) {
    const due = [...frames.values()];
    frames.clear();
    act(() => due.forEach((tick) => tick(START + elapsed)));
}

// The fills of the sweep paths drawn inside an svg
export function sweepFills(root: ParentNode): string[] {
    const sweep = ["var(--segment-off)", "var(--line)", "var(--control)"];
    return [...root.querySelectorAll("path")]
        .map((path) => path.getAttribute("fill") ?? "")
        .filter((fill) => sweep.includes(fill));
}

// The live region a chart fills with the hovered value
export function liveText(root: ParentNode): string {
    return root.querySelector("[aria-live]")?.textContent ?? "";
}
