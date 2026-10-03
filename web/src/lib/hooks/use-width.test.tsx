import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWidth } from "./use-width";

type Callback = (entries: { contentRect: { width: number } }[]) => void;

// jsdom has no ResizeObserver, so tests drive this stand-in by hand
const observers: FakeObserver[] = [];

class FakeObserver {
    callback: Callback;
    observed: Element[] = [];
    disconnected = false;
    constructor(callback: Callback) {
        this.callback = callback;
        observers.push(this);
    }
    observe(node: Element) {
        this.observed.push(node);
    }
    disconnect() {
        this.disconnected = true;
    }
    resize(width: number) {
        act(() => this.callback([{ contentRect: { width } }]));
    }
}

function Measured() {
    const [ref, width] = useWidth<HTMLDivElement>(640);
    return (
        <div ref={ref} data-testid="box">
            {width}
        </div>
    );
}

function Unattached() {
    const [, width] = useWidth<HTMLDivElement>(320);
    return <p>{width}</p>;
}

beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal("ResizeObserver", FakeObserver);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("useWidth", () => {
    it("starts from the given guess and watches the element", () => {
        render(<Measured />);
        const box = screen.getByTestId("box");
        expect(box.textContent).toBe("640");
        expect(observers).toHaveLength(1);
        expect(observers[0].observed).toEqual([box]);
    });

    it("follows the element's width, rounded down", () => {
        render(<Measured />);
        observers[0].resize(812.7);
        expect(screen.getByTestId("box").textContent).toBe("812");
    });

    it("stops watching when the element goes away", () => {
        const { unmount } = render(<Measured />);
        expect(observers[0].disconnected).toBe(false);
        unmount();
        expect(observers[0].disconnected).toBe(true);
    });

    it("keeps the guess when the ref is not attached", () => {
        render(<Unattached />);
        expect(screen.getByText("320")).toBeTruthy();
        expect(observers).toHaveLength(0);
    });
});
