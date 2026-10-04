import { GAP, pathFor, type Rect } from "@/lib/charts/cells";
import type { Step } from "@/lib/data/runs/types";
import { CONTEXTS, contextKey, type ContextKey } from "../lib/context";
import { stepMark, type MarkKind } from "../lib/words";

export const MARK = 5;
const MARK_GAP = 3;
const LANE_GAP = 10;
const MIN_CELL = 10;
const MAX_CELL = 32;

export type TimelineLayout = {
    cell: number;
    pitch: number;
    width: number;
    height: number;
    laneTop: (lane: number) => number;
    laneOf: number[];
    cellRect: (index: number) => Rect;
    field: string;
    fills: { key: ContextKey; d: string }[];
    holes: string;
    marks: { kind: MarkKind; d: string }[];
    links: { d: string; untrusted: boolean }[];
};

function outline(r: Rect): Rect[] {
    return [
        { x: r.x, y: r.y, w: r.w, h: 1 },
        { x: r.x, y: r.y + r.h - 1, w: r.w, h: 1 },
        { x: r.x, y: r.y + 1, w: 1, h: r.h - 2 },
        { x: r.x + r.w - 1, y: r.y + 1, w: 1, h: r.h - 2 },
    ];
}

// One lane per agent and one column per step, in time order.
export function timelineLayout(steps: Step[], lanes: string[], available: number): TimelineLayout {
    const count = Math.max(1, steps.length);
    const cell = Math.min(MAX_CELL, Math.max(MIN_CELL, Math.floor(available / count) - GAP));
    const pitch = cell + GAP;
    const laneHeight = cell + MARK_GAP + MARK + LANE_GAP;
    const laneTop = (lane: number) => lane * laneHeight;
    const laneOf = steps.map((step) => Math.max(0, lanes.indexOf(step.agent)));
    const cellRect = (index: number): Rect => ({ x: index * pitch, y: laneTop(laneOf[index]), w: cell, h: cell });

    const field: Rect[] = [];
    lanes.forEach((_, lane) => {
        steps.forEach((_, col) => {
            if (laneOf[col] !== lane) field.push({ x: col * pitch, y: laneTop(lane), w: cell, h: cell });
        });
    });

    const byKey = new Map<ContextKey, Rect[]>(CONTEXTS.map((context) => [context.key, []]));
    const holes: Rect[] = [];
    const marks = new Map<MarkKind, Rect[]>();
    const links: { d: string; untrusted: boolean }[] = [];
    const hole = Math.max(2, Math.round(cell / 4));

    steps.forEach((step, i) => {
        const r = cellRect(i);
        byKey.get(contextKey(step.context))?.push(r);
        if (step.context.trust === "untrusted") {
            const inset = Math.floor((cell - hole) / 2);
            holes.push({ x: r.x + inset, y: r.y + inset, w: hole, h: hole });
        }
        const mark = stepMark(step);
        if (mark) {
            const box = { x: r.x, y: r.y + cell + MARK_GAP, w: cell, h: MARK };
            const list = marks.get(mark) ?? [];
            list.push(...(mark.startsWith("would") ? outline(box) : [box]));
            marks.set(mark, list);
        }
        // A received message sits in the receiver's lane, so its line goes to the sender
        const peer = step.link?.to === step.agent ? step.link.from : step.link?.to;
        const target = peer ? lanes.indexOf(peer) : -1;
        if (step.link && target >= 0 && target !== laneOf[i]) {
            const x = r.x + Math.floor(cell / 2);
            const from = Math.min(laneTop(laneOf[i]), laneTop(target)) + cell;
            const to = Math.max(laneTop(laneOf[i]), laneTop(target));
            links.push({ d: pathFor([{ x, y: from + 1, w: 1, h: to - from - 2 }]), untrusted: step.link.untrusted });
        }
    });

    return {
        cell,
        pitch,
        width: Math.max(pitch, steps.length * pitch - GAP),
        height: Math.max(cell, lanes.length * laneHeight - LANE_GAP),
        laneTop,
        laneOf,
        cellRect,
        field: pathFor(field),
        fills: CONTEXTS.map((context) => ({ key: context.key, d: pathFor(byKey.get(context.key)!) })),
        holes: pathFor(holes),
        marks: [...marks].map(([kind, rects]) => ({ kind, d: pathFor(rects) })),
        links,
    };
}

// Axis columns at least `space` pixels apart, always including the first and last.
export function axisColumns(count: number, pitch: number, space = 64): number[] {
    if (count === 0) return [];
    const every = Math.max(1, Math.ceil(space / pitch));
    const cols: number[] = [];
    for (let col = 0; col < count; col += every) cols.push(col);
    const last = count - 1;
    if (cols[cols.length - 1] !== last) {
        if ((last - cols[cols.length - 1]) * pitch < space && cols.length > 1) cols.pop();
        cols.push(last);
    }
    return cols;
}

// The nearest step in another lane, for Up and Down.
export function nearestInLane(laneOf: number[], from: number, lane: number): number | null {
    let best: number | null = null;
    laneOf.forEach((l, i) => {
        if (l === lane && (best === null || Math.abs(i - from) < Math.abs(best - from))) best = i;
    });
    return best;
}
