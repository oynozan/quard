import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ringPath } from "@/components/charts/layout/heatmap";
import type { Step } from "@/lib/data/runs/types";
import { START, UNTRUSTED_PUBLIC, makeGuard, makeLink, makeStep } from "../../../../../test/runs-timeline-lib/steps";
import { timelineLayout } from "./layout";
import { TimelineField, stepSentence } from "./timeline-field";

const LANES = ["billing", "researcher"];
const SUMMARY = "Timeline of 3 steps across 2 agents.";

// At 412 px the labels take 76 px and the cells reach their 32 px cap: pitch 34, field 100 px wide.
function threeSteps(): Step[] {
    return [
        makeStep({ link: makeLink({ to: "researcher", untrusted: true }) }),
        makeStep({
            name: "fetchPage",
            kind: "tool_call",
            agent: "researcher",
            startedAt: START + 420,
            context: UNTRUSTED_PUBLIC,
            guard: makeGuard({ outcome: "flag", guard: "source" }),
            link: makeLink({ from: "researcher", to: "billing" }),
        }),
        makeStep({ name: "payInvoice", kind: "tool_call", startedAt: START + 9240, status: "error" }),
    ];
}

function renderField({ steps = threeSteps(), width = 412, selected = null as number | null } = {}) {
    const onOpen = vi.fn();
    const view = render(
        <TimelineField
            steps={steps}
            lanes={LANES}
            startedAt={START}
            width={width}
            summary={SUMMARY}
            selected={selected}
            onOpen={onOpen}
        />,
    );
    const svg = screen.getByRole("img");
    const live = view.container.querySelector("[aria-live]") as HTMLElement;
    const ring = () => svg.querySelector('path[fill="var(--ink)"]')?.getAttribute("d") ?? null;
    const axis = () =>
        [...view.container.querySelectorAll(".mono.relative span")].map((span) => ({
            text: span.textContent,
            style: (span as HTMLElement).style.cssText,
        }));
    return { ...view, onOpen, svg, live, ring, axis };
}

describe("stepSentence", () => {
    it("reads a step out with its place, kind, agent, time and context", () => {
        const [first, second, third] = threeSteps();
        expect(stepSentence(first, 0, 3, START)).toBe(
            "Step 1 of 3, gpt-5.4-mini, model call by billing, at 0.00 s, trusted internal context",
        );
        expect(stepSentence(second, 1, 3, START)).toBe(
            "Step 2 of 3, fetchPage, tool call by researcher, at 0.42 s, untrusted public context, flagged",
        );
        expect(stepSentence(third, 2, 3, START)).toBe(
            "Step 3 of 3, payInvoice, tool call by billing, at 9.2 s, trusted internal context, error",
        );
    });
});

describe("TimelineField drawing", () => {
    it("names the chart with the summary and how to use the keys", () => {
        const { svg } = renderField();
        expect(svg.getAttribute("aria-label")).toBe(
            `${SUMMARY} Use the arrow keys to move between steps and Enter to open one.`,
        );
        expect(svg.getAttribute("tabindex")).toBe("0");
    });

    it("draws the field, links, context fills, holes and marks from the layout", () => {
        const steps = threeSteps();
        const { svg } = renderField({ steps });
        const layout = timelineLayout(steps, LANES, 336);
        const drawn = [...svg.querySelectorAll("path")].map((path) => [
            path.getAttribute("d"),
            path.getAttribute("fill"),
        ]);
        expect(drawn).toEqual([
            [layout.field, "var(--chart-field)"],
            [layout.links[0].d, "var(--caution-text)"],
            [layout.links[1].d, "var(--ink-subtle)"],
            [layout.fills[1].d, "var(--cat-4)"],
            [layout.fills[2].d, "var(--caution-text)"],
            [layout.holes, "var(--page)"],
            [layout.marks[0].d, "var(--danger)"],
        ]);
    });

    it("colors waiting marks amber and would-block marks red", () => {
        const steps = [makeStep({ status: "waiting" }), makeStep({ guard: makeGuard({ mode: "observe" }) })];
        const { svg } = renderField({ steps });
        const layout = timelineLayout(steps, LANES, 336);
        const fillOf = (d: string) => svg.querySelector(`path[d="${d}"]`)?.getAttribute("fill");
        expect(layout.marks.map((m) => m.kind)).toEqual(["ask", "would-block"]);
        expect(fillOf(layout.marks[0].d)).toBe("var(--warning)");
        expect(fillOf(layout.marks[1].d)).toBe("var(--danger)");
    });

    it("labels each lane with its agent, using narrow labels on small screens", () => {
        const { container } = renderField();
        const labels = [...container.querySelectorAll("span[title]")];
        expect(labels.map((label) => label.getAttribute("title"))).toEqual(LANES);
        expect((labels[0].parentElement as HTMLElement).style.width).toBe("66px");
    });

    it("uses wider lane labels on wide screens", () => {
        const { container } = renderField({ width: 600 });
        const label = container.querySelector("span[title]") as HTMLElement;
        expect((label.parentElement as HTMLElement).style.width).toBe("102px");
    });

    it("scrolls sideways only when the cells do not fit", () => {
        const fits = renderField();
        expect(fits.container.querySelector(".table-scroll")).toBeNull();
        fits.unmount();
        const many = Array.from({ length: 50 }, (_, i) => makeStep({ startedAt: START + i * 100 }));
        expect(renderField({ steps: many, width: 300 }).container.querySelector(".table-scroll")).toBeTruthy();
    });

    it("marks time under the first and last columns, the last one pinned right", () => {
        const { axis } = renderField();
        expect(axis()).toEqual([
            { text: "0.00 s", style: "left: 0px; opacity: 1;" },
            { text: "9.2 s", style: "right: 0px; opacity: 1;" },
        ]);
    });

    it("keeps the time of a lone step on the left", () => {
        expect(renderField({ steps: [makeStep()] }).axis()).toEqual([
            { text: "0.00 s", style: "left: 0px; opacity: 1;" },
        ]);
    });

    it("skips an axis label that repeats the time before it", () => {
        const steps = [makeStep(), makeStep(), makeStep()];
        expect(renderField({ steps }).axis()).toEqual([{ text: "0.00 s", style: "left: 0px; opacity: 1;" }]);
    });

    it("rings the selected step without announcing it", () => {
        const { ring, live, container } = renderField({ selected: 1 });
        expect(ring()).toBe(ringPath({ x: 34, y: 50, w: 32, h: 32 }));
        expect(live.textContent).toBe("");
        const lane = container.querySelector('span[title="researcher"]') as HTMLElement;
        expect(lane.classList.contains("text-ink")).toBe(true);
        expect(container.querySelector('span[title="billing"]')?.classList.contains("text-ink-muted")).toBe(true);
    });
});

describe("TimelineField pointer", () => {
    it("rings, announces and explains the step under the pointer", () => {
        const { svg, ring, live, axis } = renderField();
        expect(ring()).toBeNull();
        fireEvent.pointerMove(svg, { clientX: 40 });
        expect(ring()).toBe(ringPath({ x: 34, y: 50, w: 32, h: 32 }));
        expect(live.textContent).toContain("Step 2 of 3, fetchPage");
        expect(screen.getByText("fetchPage").nextElementSibling?.textContent).toBe("tool call");
        expect(screen.getByText("researcher · untrusted public · flagged")).toBeTruthy();
        const tooltip = screen.getByText("fetchPage").closest('[role="presentation"]') as HTMLElement;
        expect(tooltip.style.left).toBe("76px");
        expect(tooltip.style.top).toBe("40px");
        // Both axis labels sit within 56 px of the cursor, so they fade for the cursor's own time
        expect(axis()).toEqual([
            { text: "0.00 s", style: "left: 0px; opacity: 0;" },
            { text: "9.2 s", style: "right: 0px; opacity: 0;" },
            { text: "0.42 s", style: "left: 34px;" },
        ]);
    });

    it("keeps the cursor on the first or last step past either edge", () => {
        const { svg, live } = renderField();
        fireEvent.pointerMove(svg, { clientX: -50 });
        expect(live.textContent).toContain("Step 1 of 3");
        fireEvent.pointerMove(svg, { clientX: 1000 });
        expect(live.textContent).toContain("Step 3 of 3");
    });

    it("turns the tooltip to the left in the right half of the field", () => {
        const { svg } = renderField();
        fireEvent.pointerMove(svg, { clientX: 80 });
        expect(screen.getByText("billing · trusted internal · blocked or failed")).toBeTruthy();
        const tooltip = screen.getByText("payInvoice").closest('[role="presentation"]') as HTMLElement;
        expect(tooltip.style.right).toBe("calc(100% - 58px)");
        expect(tooltip.style.top).toBe("0px");
        const cursorTime = screen.getAllByText("9.2 s")[1] as HTMLElement;
        expect(cursorTime.style.right).toBe("calc(100% - 100px)");
    });

    it("leaves the caption at agent and context for an unmarked step", () => {
        const { svg } = renderField();
        fireEvent.pointerMove(svg, { clientX: 5 });
        expect(screen.getByText("billing · trusted internal")).toBeTruthy();
    });

    it("clears the cursor when the pointer leaves", () => {
        const { svg, ring, live } = renderField();
        fireEvent.pointerMove(svg, { clientX: 40 });
        fireEvent.pointerLeave(svg);
        expect(ring()).toBeNull();
        expect(live.textContent).toBe("");
        expect(screen.queryByRole("presentation")).toBeNull();
    });

    it("opens the step under the pointer on click, and nothing before the pointer moves", () => {
        const { svg, onOpen } = renderField();
        fireEvent.click(svg);
        expect(onOpen).not.toHaveBeenCalled();
        fireEvent.pointerMove(svg, { clientX: 40 });
        fireEvent.click(svg);
        expect(onOpen).toHaveBeenCalledWith(1);
    });
});

describe("TimelineField keyboard", () => {
    // Lanes: billing, researcher, billing, billing
    function fourSteps(): Step[] {
        return [
            makeStep(),
            makeStep({ agent: "researcher", startedAt: START + 1000 }),
            makeStep({ startedAt: START + 2000 }),
            makeStep({ startedAt: START + 3000 }),
        ];
    }
    const at = (live: HTMLElement) => live.textContent?.split(",")[0] ?? "";

    it("starts on the first step when focused, or on the selected one", () => {
        const first = renderField({ steps: fourSteps() });
        fireEvent.focus(first.svg);
        expect(at(first.live)).toBe("Step 1 of 4");
        first.unmount();
        const picked = renderField({ steps: fourSteps(), selected: 2 });
        fireEvent.focus(picked.svg);
        expect(at(picked.live)).toBe("Step 3 of 4");
    });

    it("keeps the hovered step when focus arrives, and clears it on blur", () => {
        const { svg, live } = renderField({ steps: fourSteps(), selected: 2 });
        fireEvent.pointerMove(svg, { clientX: 40 });
        fireEvent.focus(svg);
        expect(at(live)).toBe("Step 2 of 4");
        fireEvent.blur(svg);
        expect(live.textContent).toBe("");
    });

    it("moves along the steps with Left, Right, Home and End, stopping at the ends", () => {
        const { svg, live } = renderField({ steps: fourSteps() });
        fireEvent.focus(svg);
        const press = (key: string) => {
            expect(fireEvent.keyDown(svg, { key })).toBe(false);
            return at(live);
        };
        expect(press("ArrowRight")).toBe("Step 2 of 4");
        expect(press("End")).toBe("Step 4 of 4");
        expect(press("ArrowRight")).toBe("Step 4 of 4");
        expect(press("ArrowLeft")).toBe("Step 3 of 4");
        expect(press("Home")).toBe("Step 1 of 4");
        expect(press("ArrowLeft")).toBe("Step 1 of 4");
    });

    it("jumps to the nearest step in the lane above or below, and stays put at the edge", () => {
        const { svg, live } = renderField({ steps: fourSteps(), selected: 3 });
        fireEvent.keyDown(svg, { key: "ArrowDown" });
        expect(at(live)).toBe("Step 2 of 4");
        fireEvent.keyDown(svg, { key: "ArrowDown" });
        expect(at(live)).toBe("Step 2 of 4");
        fireEvent.keyDown(svg, { key: "ArrowUp" });
        expect(at(live)).toBe("Step 1 of 4");
        fireEvent.keyDown(svg, { key: "ArrowUp" });
        expect(at(live)).toBe("Step 1 of 4");
    });

    it("lands on the first step for any arrow when nothing is active yet", () => {
        for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
            const { svg, live, unmount } = renderField({ steps: fourSteps() });
            fireEvent.keyDown(svg, { key });
            expect(at(live)).toBe("Step 1 of 4");
            unmount();
        }
    });

    it("opens the active step with Enter or Space", () => {
        const selected = renderField({ steps: fourSteps(), selected: 2 });
        expect(fireEvent.keyDown(selected.svg, { key: "Enter" })).toBe(false);
        expect(selected.onOpen).toHaveBeenCalledWith(2);
        selected.unmount();
        const hovered = renderField({ steps: fourSteps() });
        fireEvent.focus(hovered.svg);
        fireEvent.keyDown(hovered.svg, { key: "ArrowRight" });
        fireEvent.keyDown(hovered.svg, { key: " " });
        expect(hovered.onOpen).toHaveBeenCalledWith(1);
    });

    it("does nothing for Enter with no active step, or for other keys", () => {
        const { svg, live, onOpen } = renderField({ steps: fourSteps() });
        expect(fireEvent.keyDown(svg, { key: "Enter" })).toBe(true);
        expect(fireEvent.keyDown(svg, { key: "a" })).toBe(true);
        expect(onOpen).not.toHaveBeenCalled();
        expect(live.textContent).toBe("");
    });

    it("clears the cursor with Escape", () => {
        const { svg, live } = renderField({ steps: fourSteps() });
        fireEvent.focus(svg);
        fireEvent.keyDown(svg, { key: "Escape" });
        expect(live.textContent).toBe("");
    });

    it("ignores keys when there are no steps", () => {
        const { svg, live } = renderField({ steps: [] });
        expect(fireEvent.keyDown(svg, { key: "ArrowRight" })).toBe(true);
        expect(live.textContent).toBe("");
    });
});
