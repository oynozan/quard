import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentCall } from "@/lib/data/agents";
import { CALLS, manyCalls } from "../../../../test/agents-graph-timeline/fixtures";
import { resizeAll, stubResizeObserver } from "../../../../test/agents-graph-timeline/resize";
import { CallField } from "./call-field";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(stubResizeObserver);
afterEach(() => {
    vi.unstubAllGlobals();
    push.mockReset();
});

const UNTRUSTED = { origin: "web", trust: "untrusted", sensitivity: "public" } as const;

function renderField(calls: AgentCall[] = CALLS) {
    const view = render(<CallField calls={calls} summary="Recent calls by planner." />);
    const field = screen.getByRole("img", { name: "Recent calls by planner." });
    // The plot starts 110px from the page edge, after the lane labels
    field.getBoundingClientRect = () => ({ left: 110 }) as DOMRect;
    const tooltip = () => view.container.querySelector('[role="presentation"]') as HTMLElement | null;
    const announced = () => view.container.querySelector("[aria-live]")?.textContent;
    const paths = (fill: string) => [...view.container.querySelectorAll(`path[fill="${fill}"]`)];
    const cells = (fill: string) =>
        paths(fill).reduce((sum, path) => sum + (path.getAttribute("d") ?? "").split("M").length - 1, 0);
    const lanes = () => view.container.querySelector("ul")?.textContent;
    return { ...view, field, tooltip, announced, paths, cells, lanes };
}

describe("CallField drawing", () => {
    it("draws only the lanes the calls use, with the oldest and newest times under the plot", () => {
        const { lanes, container } = renderField();
        expect(lanes()).toBe("Model callsTool callsGuard decisionsApprovalsMemory");
        expect(container.querySelector("svg")?.getAttribute("height")).toBe("102");
        expect(screen.getByText("12:00:00")).toBeTruthy();
        expect(screen.getByText("12:00:50")).toBeTruthy();
    });

    it("shortens the lane names on a narrow pane", () => {
        const { lanes } = renderField();
        resizeAll(500);
        expect(lanes()).toBe("ModelToolGuardApprovalMemory");
    });

    it("colors each call's cell by its context and punches a hole in untrusted ones", () => {
        const { cells } = renderField();
        expect(cells("var(--cat-4)")).toBe(1);
        expect(cells("var(--chart-context)")).toBe(3);
        expect(cells("var(--caution-text)")).toBe(1);
        expect(cells("var(--cat-3)")).toBe(1);
        expect(cells("var(--page)")).toBe(2);
        expect(cells("var(--chart-field)")).toBe(24);
        expect(cells("var(--mint)")).toBe(0);
    });

    it("marks guard results under the calls, outlining what observe mode would have done", () => {
        const { paths, container } = renderField();
        expect(paths("var(--danger)")).toHaveLength(2);
        expect(paths("var(--warning)")).toHaveLength(1);
        const outlined = [...container.querySelectorAll('path[fill="none"]')];
        expect(outlined.map((path) => path.getAttribute("stroke"))).toEqual(["var(--warning)", "var(--danger)"]);
    });

    it("drops the untrusted hole once cells get too small to show it", () => {
        const calls = manyCalls(200).map((call) => ({ ...call, context: UNTRUSTED }));
        const { cells } = renderField(calls);
        expect(cells("var(--caution-text)")).toBe(131);
        expect(cells("var(--page)")).toBe(0);
        expect(screen.getByText("12:01:09")).toBeTruthy();
        expect(screen.getByText("12:03:19")).toBeTruthy();
    });

    it("shows no columns or times when the pane has no room for one", () => {
        const { field, lanes, container, tooltip } = renderField();
        resizeAll(60);
        expect(lanes()).toBe("");
        expect(container.querySelector("svg")?.getAttribute("width")).toBe("0");
        expect(screen.queryByText("12:00:00")).toBeNull();
        fireEvent.keyDown(field, { key: "ArrowLeft" });
        fireEvent.click(field, { clientX: 112 });
        expect(tooltip()).toBeNull();
        expect(push).not.toHaveBeenCalled();
    });
});

describe("CallField keyboard", () => {
    it("lands the first arrow key on the newest call and reads it out", () => {
        const { field, tooltip, announced, cells } = renderField();
        fireEvent.keyDown(field, { key: "ArrowLeft" });
        expect(tooltip()?.textContent).toBe("send_emailtool call12:00:50 · Untrusted public · run runs6-00");
        expect(tooltip()?.style.left).toBe("196px");
        expect(announced()).toBe("Tool call send_email at 12:00:50, untrusted public context, blocked, run runs6-00");
        expect(cells("var(--mint)")).toBe(1);
        expect(cells("var(--highlight)")).toBe(4);
        expect(field.className).toContain("cursor-pointer");
    });

    it("reads a call with no guard mark without one", () => {
        const { field, announced } = renderField();
        fireEvent.keyDown(field, { key: "Home" });
        expect(announced()).toBe("Model call draft at 12:00:00, trusted internal context, run runs1-00");
    });

    it("opens the focused call's run on Enter", () => {
        const { field } = renderField();
        fireEvent.keyDown(field, { key: "ArrowLeft" });
        fireEvent.keyDown(field, { key: "ArrowLeft" });
        fireEvent.keyDown(field, { key: "Enter" });
        expect(push).toHaveBeenCalledWith("/runs/runs5-0000-1111");
    });

    it("does nothing on Enter before a call is focused", () => {
        const { field, tooltip } = renderField();
        fireEvent.keyDown(field, { key: "Enter" });
        expect(push).not.toHaveBeenCalled();
        expect(tooltip()).toBeNull();
        expect(field.className).not.toContain("cursor-pointer");
    });

    it("clears the readout when focus leaves the plot", () => {
        const { field, tooltip, announced } = renderField();
        fireEvent.keyDown(field, { key: "ArrowLeft" });
        fireEvent.blur(field);
        expect(tooltip()).toBeNull();
        expect(announced()).toBe("");
    });

    it("keeps the keyboard call in focus while the pointer moves over another", () => {
        const { field, tooltip } = renderField();
        fireEvent.keyDown(field, { key: "Home" });
        fireEvent.mouseMove(field, { clientX: 141 });
        expect(tooltip()?.textContent).toContain("draft");
        fireEvent.blur(field);
        expect(tooltip()?.textContent).toContain("refund");
    });

    it("puts the readout on the left of calls in the right half", () => {
        const { field, tooltip } = renderField(manyCalls(60));
        fireEvent.keyDown(field, { key: "End" });
        expect(tooltip()?.textContent).toContain("m59");
        expect(tooltip()?.style.right).toBe("calc(100% - 872.5px)");
    });
});

describe("CallField pointer", () => {
    it("reads out the call under the pointer until it leaves", () => {
        const { field, tooltip } = renderField();
        fireEvent.mouseMove(field, { clientX: 141 });
        expect(tooltip()?.textContent).toBe("refundapproval12:00:20 · Trusted public · run runs3-00");
        fireEvent.mouseLeave(field);
        expect(tooltip()).toBeNull();
    });

    it("shows nothing when the pointer is past the last call", () => {
        const { field, tooltip } = renderField();
        fireEvent.mouseMove(field, { clientX: 194 });
        expect(tooltip()).toBeNull();
    });

    it("opens the run of the clicked call", () => {
        const { field } = renderField();
        fireEvent.click(field, { clientX: 141 });
        expect(push).toHaveBeenCalledWith("/runs/runs3-0000-1111");
    });

    it("ignores clicks left of the first call or right of the last", () => {
        const { field } = renderField();
        fireEvent.click(field, { clientX: 100 });
        fireEvent.click(field, { clientX: 194 });
        expect(push).not.toHaveBeenCalled();
    });
});
