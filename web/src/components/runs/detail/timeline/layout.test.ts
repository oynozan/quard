// @vitest-environment node
import { describe, expect, it } from "vitest";
import { pathFor } from "@/lib/charts/cells";
import type { Label } from "@/lib/data/types";
import {
    UNTRUSTED_INTERNAL,
    UNTRUSTED_PUBLIC,
    makeGuard,
    makeLink,
    makeStep,
} from "../../../../../test/runs-timeline-lib/steps";
import { axisColumns, nearestInLane, timelineLayout } from "./layout";

const LANES = ["billing", "researcher"];

// At 300 px for three steps the cell hits its 32 px cap: pitch 34, lanes 50 px apart.
function threeSteps() {
    return [
        makeStep({ agent: "billing", link: makeLink({ to: "researcher", untrusted: true }) }),
        makeStep({
            agent: "researcher",
            context: UNTRUSTED_PUBLIC,
            guard: makeGuard({ outcome: "block" }),
            link: makeLink({ to: "billing" }),
        }),
        makeStep({ agent: "billing", context: UNTRUSTED_INTERNAL, status: "waiting" }),
    ];
}

describe("timelineLayout sizes", () => {
    it("caps the cell at 32 px and sizes the field from the lanes and steps", () => {
        const layout = timelineLayout(threeSteps(), LANES, 300);
        expect(layout.cell).toBe(32);
        expect(layout.pitch).toBe(34);
        expect(layout.width).toBe(100);
        expect(layout.height).toBe(90);
        expect(layout.laneTop(1)).toBe(50);
    });

    it("keeps the cell at least 10 px when space is tight", () => {
        const steps = Array.from({ length: 50 }, () => makeStep());
        const layout = timelineLayout(steps, LANES, 100);
        expect(layout.cell).toBe(10);
        expect(layout.pitch).toBe(12);
    });

    it("fits the cell to the space between the limits", () => {
        const steps = Array.from({ length: 10 }, () => makeStep());
        expect(timelineLayout(steps, LANES, 200).cell).toBe(18);
    });

    it("still gives one cell of room when there are no steps or lanes", () => {
        const layout = timelineLayout([], [], 300);
        expect(layout.cell).toBe(32);
        expect(layout.width).toBe(34);
        expect(layout.height).toBe(32);
        expect(layout.field).toBe("");
        expect(layout.links).toEqual([]);
        expect(layout.marks).toEqual([]);
    });
});

describe("timelineLayout cells", () => {
    it("places each step in its agent's lane, one column per step", () => {
        const layout = timelineLayout(threeSteps(), LANES, 300);
        expect(layout.laneOf).toEqual([0, 1, 0]);
        expect(layout.cellRect(1)).toEqual({ x: 34, y: 50, w: 32, h: 32 });
    });

    it("puts a step from an agent with no lane in the first lane", () => {
        const layout = timelineLayout([makeStep({ agent: "stranger" })], LANES, 300);
        expect(layout.laneOf).toEqual([0]);
    });

    it("fills every empty slot of the field with the background", () => {
        const layout = timelineLayout(threeSteps(), LANES, 300);
        const empty = [
            { x: 34, y: 0, w: 32, h: 32 },
            { x: 0, y: 50, w: 32, h: 32 },
            { x: 68, y: 50, w: 32, h: 32 },
        ];
        expect(layout.field).toBe(pathFor(empty));
    });

    it("groups the cells by context, keeping an empty path for unused contexts", () => {
        const layout = timelineLayout(threeSteps(), LANES, 300);
        expect(layout.fills).toEqual([
            { key: "trusted-public", d: "" },
            { key: "trusted-internal", d: pathFor([{ x: 0, y: 0, w: 32, h: 32 }]) },
            { key: "untrusted-public", d: pathFor([{ x: 34, y: 50, w: 32, h: 32 }]) },
            { key: "untrusted-internal", d: pathFor([{ x: 68, y: 0, w: 32, h: 32 }]) },
        ]);
    });

    it("leaves a step with an unknown label out of every fill", () => {
        const odd = { origin: "x", trust: "unknown", sensitivity: "secret" } as unknown as Label;
        const layout = timelineLayout([makeStep({ context: odd })], LANES, 300);
        expect(layout.fills.every((fill) => fill.d === "")).toBe(true);
    });

    it("punches a centered hole in each untrusted cell", () => {
        const layout = timelineLayout(threeSteps(), LANES, 300);
        const holes = [
            { x: 46, y: 62, w: 8, h: 8 },
            { x: 80, y: 12, w: 8, h: 8 },
        ];
        expect(layout.holes).toBe(pathFor(holes));
    });

    it("shrinks the hole with the smallest cells", () => {
        const steps = Array.from({ length: 50 }, () => makeStep({ context: UNTRUSTED_PUBLIC }));
        const layout = timelineLayout(steps, LANES, 100);
        expect(layout.holes.startsWith(pathFor([{ x: 3, y: 3, w: 3, h: 3 }]))).toBe(true);
    });
});

describe("timelineLayout marks", () => {
    it("draws a solid bar under blocked and waiting steps, grouped by kind", () => {
        const steps = [...threeSteps(), makeStep({ status: "error" })];
        const layout = timelineLayout(steps, LANES, 400);
        expect(layout.cell).toBe(32);
        expect(layout.marks).toEqual([
            {
                kind: "block",
                d: pathFor([
                    { x: 34, y: 85, w: 32, h: 5 },
                    { x: 102, y: 35, w: 32, h: 5 },
                ]),
            },
            { kind: "ask", d: pathFor([{ x: 68, y: 35, w: 32, h: 5 }]) },
        ]);
    });

    it("draws only an outline under what observe mode would have done", () => {
        const guard = makeGuard({ outcome: "block", mode: "observe" });
        const layout = timelineLayout([makeStep({ guard })], LANES, 300);
        const outline = [
            { x: 0, y: 35, w: 32, h: 1 },
            { x: 0, y: 39, w: 32, h: 1 },
            { x: 0, y: 36, w: 1, h: 3 },
            { x: 31, y: 36, w: 1, h: 3 },
        ];
        expect(layout.marks).toEqual([{ kind: "would-block", d: pathFor(outline) }]);
    });
});

describe("timelineLayout links", () => {
    it("draws a line between lanes for a link, downward or upward", () => {
        const layout = timelineLayout(threeSteps(), LANES, 300);
        expect(layout.links).toEqual([
            { d: pathFor([{ x: 16, y: 33, w: 1, h: 16 }]), untrusted: true },
            { d: pathFor([{ x: 50, y: 33, w: 1, h: 16 }]), untrusted: false },
        ]);
    });

    it("skips links to the same lane or to an agent with no lane", () => {
        const steps = [
            makeStep({ agent: "billing", link: makeLink({ to: "billing" }) }),
            makeStep({ agent: "billing", link: makeLink({ to: "outside" }) }),
        ];
        expect(timelineLayout(steps, LANES, 300).links).toEqual([]);
    });
});

describe("axisColumns", () => {
    it("is empty without steps", () => {
        expect(axisColumns(0, 34)).toEqual([]);
    });

    it("labels columns at least 64 px apart, ending on the last one", () => {
        expect(axisColumns(5, 34)).toEqual([0, 2, 4]);
    });

    it("drops the label before the last when the two would crowd", () => {
        expect(axisColumns(6, 34)).toEqual([0, 2, 5]);
    });

    it("keeps the first label even when the last sits close to it", () => {
        expect(axisColumns(2, 34)).toEqual([0, 1]);
    });

    it("labels every column when columns are wide", () => {
        expect(axisColumns(3, 100)).toEqual([0, 1, 2]);
    });

    it("takes a custom spacing", () => {
        expect(axisColumns(5, 10, 20)).toEqual([0, 2, 4]);
    });
});

describe("nearestInLane", () => {
    it("finds the closest step in the lane, the earlier one on a tie", () => {
        expect(nearestInLane([0, 1, 0, 1, 0], 2, 1)).toBe(1);
        expect(nearestInLane([0, 0, 0, 1], 0, 1)).toBe(3);
    });

    it("returns null when the lane has no steps", () => {
        expect(nearestInLane([0, 1, 0], 1, 2)).toBeNull();
    });
});
