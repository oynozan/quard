import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSweep } from "./use-sweep";

// Animation frames run only when a test calls runFrame, at a time it picks
const frames = { queue: new Map<number, FrameRequestCallback>(), next: 1 };
const START = 1000;
const PERIOD = 1400;

function runFrame(now: number) {
    const due = [...frames.queue.values()];
    frames.queue.clear();
    act(() => due.forEach((tick) => tick(now)));
}

function stubMotion(reduced: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query.includes("reduce") }));
}

beforeEach(() => {
    frames.queue.clear();
    frames.next = 1;
    vi.stubGlobal("requestAnimationFrame", (tick: FrameRequestCallback) => {
        frames.queue.set(frames.next, tick);
        return frames.next++;
    });
    vi.stubGlobal(
        "cancelAnimationFrame",
        vi.fn((id: number) => frames.queue.delete(id)),
    );
    vi.spyOn(performance, "now").mockReturnValue(START);
    stubMotion(false);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("useSweep", () => {
    it("stays idle while nothing is loading", () => {
        const { result } = renderHook(() => useSweep(20, false));
        expect(result.current).toBeNull();
        expect(frames.queue.size).toBe(0);
    });

    it("stays idle when the visitor prefers reduced motion", () => {
        stubMotion(true);
        const { result } = renderHook(() => useSweep(20, true));
        expect(result.current).toBeNull();
        expect(frames.queue.size).toBe(0);
    });

    it("starts off the left edge and moves across the field", () => {
        const { result } = renderHook(() => useSweep(20, true));
        expect(result.current).toBeNull();
        runFrame(START);
        expect(result.current).toBe(-7);
        // A quarter of the way in, the ease is still slow
        runFrame(START + PERIOD / 4);
        expect(result.current).toBe(-5);
        // Halfway, it reaches the middle of the field
        runFrame(START + PERIOD / 2);
        expect(result.current).toBe(10);
        runFrame(START + (PERIOD * 3) / 4);
        expect(result.current).toBe(25);
    });

    it("keeps asking for frames when a frame lands on the same column", () => {
        const { result } = renderHook(() => useSweep(20, true));
        runFrame(START + PERIOD / 2);
        runFrame(START + PERIOD / 2);
        expect(result.current).toBe(10);
        expect(frames.queue.size).toBe(1);
    });

    it("loops back to the start after each period", () => {
        const { result } = renderHook(() => useSweep(20, true));
        runFrame(START + PERIOD / 2);
        runFrame(START + PERIOD);
        expect(result.current).toBe(-7);
    });

    it("restarts across the new width when the column count changes", () => {
        const { result, rerender } = renderHook(({ columns }) => useSweep(columns, true), {
            initialProps: { columns: 20 },
        });
        runFrame(START + PERIOD / 2);
        rerender({ columns: 40 });
        expect(cancelAnimationFrame).toHaveBeenCalledWith(2);
        // Halfway across 40 columns is column 20
        runFrame(START + PERIOD / 2);
        expect(result.current).toBe(20);
        expect(frames.queue.size).toBe(1);
    });

    it("goes back to idle when loading ends", () => {
        const { result, rerender } = renderHook(({ active }) => useSweep(20, active), {
            initialProps: { active: true },
        });
        runFrame(START + PERIOD / 2);
        rerender({ active: false });
        expect(result.current).toBeNull();
        expect(cancelAnimationFrame).toHaveBeenCalled();
        expect(frames.queue.size).toBe(0);
    });

    it("stops asking for frames when the chart unmounts", () => {
        const { unmount } = renderHook(() => useSweep(20, true));
        runFrame(START);
        unmount();
        expect(cancelAnimationFrame).toHaveBeenCalledWith(2);
        expect(frames.queue.size).toBe(0);
    });
});
