import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFitWidth } from "./use-fit-width";

// jsdom has no ResizeObserver, so a fake one records what it watches and reports widths on demand
const observers: FakeObserver[] = [];

class FakeObserver {
    watched: Element[] = [];
    disconnected = false;
    constructor(private readonly callback: ResizeObserverCallback) {
        observers.push(this);
    }
    observe(node: Element) {
        this.watched.push(node);
    }
    disconnect() {
        this.disconnected = true;
    }
    resize(width: number) {
        const entry = { contentRect: { width } } as ResizeObserverEntry;
        act(() => this.callback([entry], this as unknown as ResizeObserver));
    }
}

function Pane({ attach = true }: { attach?: boolean }) {
    const [ref, width] = useFitWidth<HTMLDivElement>(320);
    return (
        <div ref={attach ? ref : undefined} data-testid="pane">
            {width}
        </div>
    );
}

beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal("ResizeObserver", FakeObserver);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("useFitWidth", () => {
    it("starts at the initial width and watches the attached node", () => {
        render(<Pane />);
        const pane = screen.getByTestId("pane");
        expect(pane.textContent).toBe("320");
        expect(observers).toHaveLength(1);
        expect(observers[0].watched).toEqual([pane]);
    });

    it("follows the node's width, rounded down to whole pixels", () => {
        render(<Pane />);
        observers[0].resize(512.7);
        expect(screen.getByTestId("pane").textContent).toBe("512");
    });

    it("keeps the last width when a detached node reports zero", () => {
        render(<Pane />);
        observers[0].resize(480);
        observers[0].resize(0);
        expect(screen.getByTestId("pane").textContent).toBe("480");
    });

    it("keeps the initial width and watches nothing until a node is attached", () => {
        render(<Pane attach={false} />);
        expect(screen.getByTestId("pane").textContent).toBe("320");
        expect(observers).toHaveLength(0);
    });

    it("stops watching a node once it is detached", () => {
        const { rerender } = render(<Pane />);
        observers[0].resize(480);
        rerender(<Pane attach={false} />);
        expect(observers[0].disconnected).toBe(true);
        expect(observers).toHaveLength(1);
        expect(screen.getByTestId("pane").textContent).toBe("480");
    });

    it("stops watching when the chart unmounts", () => {
        const { unmount } = render(<Pane />);
        unmount();
        expect(observers[0].disconnected).toBe(true);
    });
});
