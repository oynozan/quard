import { act } from "@testing-library/react";
import { vi } from "vitest";

// Holds animation frames until a test runs them, so focus moves happen when the test says
const frames: FrameRequestCallback[] = [];

export function holdFrames() {
    frames.length = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
}

export function runFrames() {
    act(() => {
        for (const frame of frames.splice(0)) frame(0);
    });
}
