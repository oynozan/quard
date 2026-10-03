import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Step } from "@/lib/data/runs/types";
import { START, UNTRUSTED_PUBLIC, makeStep } from "../../../../../test/runs-timeline-lib/steps";
import { RunTimeline } from "./run-timeline";

// jsdom has no ResizeObserver; this one reports a width when asked
let report: ((width: number) => void) | null = null;

class FakeResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe() {
        report = (width) =>
            act(() =>
                this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver),
            );
    }
    disconnect() {}
}

beforeEach(() => {
    report = null;
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const LANES = ["billing", "researcher"];

function steps(): Step[] {
    return [
        makeStep({ name: "gpt-5.4-mini" }),
        makeStep({ name: "fetchPage", kind: "tool_call", agent: "researcher", context: UNTRUSTED_PUBLIC }),
        makeStep({ name: "payInvoice", kind: "tool_call", context: UNTRUSTED_PUBLIC }),
    ];
}

function readout(): string {
    return screen.getByText("Untrusted context").parentElement?.textContent ?? "";
}

describe("RunTimeline summary", () => {
    it("counts untrusted steps and says where the context turned untrusted", () => {
        render(<RunTimeline steps={steps()} lanes={LANES} startedAt={START} />);
        expect(screen.getByRole("region", { name: "Timeline" })).toBeTruthy();
        expect(readout()).toBe("Untrusted context2steps");
        expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
            "Timeline of 3 steps across 2 agents, colored by context label. " +
                "Context turned untrusted at step 2 (fetchPage, researcher); 2 steps ran on untrusted context. " +
                "Use the arrow keys to move between steps and Enter to open one.",
        );
    });

    it("says every step was trusted, naming a single agent in the singular", () => {
        render(<RunTimeline steps={[makeStep(), makeStep()]} lanes={["billing"]} startedAt={START} />);
        expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
            "Timeline of 2 steps across 1 agent, colored by context label. Every step ran on trusted context. " +
                "Use the arrow keys to move between steps and Enter to open one.",
        );
        expect(readout()).toBe("Untrusted context0steps");
    });

    it("counts a single untrusted step in the singular", () => {
        render(<RunTimeline steps={[makeStep({ context: UNTRUSTED_PUBLIC })]} lanes={["billing"]} startedAt={START} />);
        expect(readout()).toBe("Untrusted context1step");
        expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
            "Timeline of 1 step across 1 agent, colored by context label. " +
                "Context turned untrusted at step 1 (gpt-5.4-mini, billing); 1 step ran on untrusted context. " +
                "Use the arrow keys to move between steps and Enter to open one.",
        );
    });

    it("shows an empty state with a dash and the legend when the run has no steps", () => {
        render(<RunTimeline steps={[]} lanes={[]} startedAt={START} />);
        expect(screen.getByText("This run has no steps yet")).toBeTruthy();
        expect(screen.queryByRole("img")).toBeNull();
        expect(readout()).toBe("Untrusted context—steps");
        expect(screen.getByText("Legend:")).toBeTruthy();
    });

    it("narrows the lane labels when the pane shrinks below 520 px", () => {
        const { container } = render(<RunTimeline steps={steps()} lanes={LANES} startedAt={START} />);
        const labels = () => (container.querySelector("span[title]")?.parentElement as HTMLElement).style.width;
        expect(labels()).toBe("102px");
        report?.(400);
        expect(labels()).toBe("66px");
    });
});

describe("RunTimeline drawer", () => {
    it("opens the step named by the link on first render", async () => {
        const list = steps();
        render(<RunTimeline steps={list} lanes={LANES} startedAt={START} initialStep={list[1].id} />);
        const dialog = await screen.findByRole("dialog");
        expect(dialog.textContent).toContain("fetchPage");
    });

    it("opens nothing when the linked step is not in the run", () => {
        render(<RunTimeline steps={steps()} lanes={LANES} startedAt={START} initialStep="ffffffffffffffff" />);
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("opens a clicked cell in the drawer and closes it again", async () => {
        render(<RunTimeline steps={steps()} lanes={LANES} startedAt={START} />);
        expect(screen.queryByRole("dialog")).toBeNull();
        const svg = screen.getByRole("img");
        fireEvent.pointerMove(svg, { clientX: 0 });
        fireEvent.click(svg);
        const dialog = await screen.findByRole("dialog");
        expect(dialog.textContent).toContain("gpt-5.4-mini");
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("opens a step from the table view", async () => {
        render(<RunTimeline steps={steps()} lanes={LANES} startedAt={START} />);
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        const table = screen.getByRole("table", { name: "Steps of this run in time order" });
        expect((table.parentElement as HTMLElement).style.maxHeight).toBe("260px");
        fireEvent.click(screen.getByRole("button", { name: "payInvoice" }));
        const dialog = await screen.findByRole("dialog");
        expect(dialog.textContent).toContain("payInvoice");
    });

    it("grows the table with the number of lanes", () => {
        const lanes = ["a", "b", "c", "d"];
        render(<RunTimeline steps={steps()} lanes={lanes} startedAt={START} />);
        fireEvent.click(screen.getByRole("button", { name: "Table" }));
        const table = screen.getByRole("table");
        expect((table.parentElement as HTMLElement).style.maxHeight).toBe("280px");
    });

    it("closes the drawer when new data no longer has the open step", async () => {
        const list = steps();
        const { rerender } = render(
            <RunTimeline steps={list} lanes={LANES} startedAt={START} initialStep={list[2].id} />,
        );
        await screen.findByRole("dialog");
        rerender(<RunTimeline steps={list.slice(0, 1)} lanes={LANES} startedAt={START} initialStep={list[2].id} />);
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });
});
