import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mermaidConfig } from "../../theme/mermaid-config";
import { Mermaid } from "./mermaid";

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: mermaid }));

// jsdom has no IntersectionObserver, so tests decide when a diagram is in view
let reportView: (entries: Array<{ isIntersecting: boolean }>) => void;
const disconnect = vi.fn();

class FakeObserver {
    constructor(callback: typeof reportView) {
        reportView = callback;
    }
    observe() {}
    disconnect = disconnect;
}

// Waits for the lazy import and the render promise to settle
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    mermaid.render.mockResolvedValue({ svg: "<svg data-chart></svg>" });
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe("Mermaid", () => {
    it("waits until the diagram scrolls into view", async () => {
        const { container } = render(<Mermaid chart="graph TD;" />);
        await act(async () => reportView([{ isIntersecting: false }]));
        await settle();
        expect(mermaid.render).not.toHaveBeenCalled();
        expect(container.querySelector(".quard-mermaid")?.innerHTML).toBe("");
    });

    it("renders with the Quard config once visible", async () => {
        const { container } = render(<Mermaid chart="graph TD;\nA --> B;" />);
        await act(async () => reportView([{ isIntersecting: true }]));
        await settle();
        expect(disconnect).toHaveBeenCalled();
        expect(mermaid.initialize).toHaveBeenCalledWith(mermaidConfig);
        const [id, chart] = mermaid.render.mock.calls[0] as [string, string];
        expect(id).toMatch(/^mermaid-[\w-]+$/);
        expect(chart).toBe("graph TD;\nA --> B;");
        expect(container.querySelector("[data-chart]")).toBeTruthy();
    });

    it("logs a broken chart instead of throwing", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        mermaid.render.mockRejectedValue(new Error("bad chart"));
        const { container } = render(<Mermaid chart="nope" />);
        await act(async () => reportView([{ isIntersecting: true }]));
        await settle();
        expect(error).toHaveBeenCalledWith("Error while rendering mermaid", expect.any(Error));
        expect(container.querySelector(".quard-mermaid")?.innerHTML).toBe("");
    });

    it("drops a result that arrives after unmount", async () => {
        let finish: (value: { svg: string }) => void = () => {};
        mermaid.render.mockReturnValue(new Promise((resolve) => (finish = resolve)));
        const { unmount } = render(<Mermaid chart="graph TD;" />);
        await act(async () => reportView([{ isIntersecting: true }]));
        await settle();
        unmount();
        await act(async () => finish({ svg: "<svg></svg>" }));
        expect(disconnect).toHaveBeenCalled();
    });
});
