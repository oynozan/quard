import type { AgentEdge } from "@/lib/data/agents";
import type { GraphLayout, LayoutNode } from "./graph-layout";
import { edgeWidth } from "./tones";

// "across" runs layers left to right; "down" runs them top to bottom on narrow screens
export type Orientation = "across" | "down";

export type Point = { x: number; y: number };

// Where a node's label sits: before the square, after it, or under it
export type LabelSide = "before" | "after";

export type PlacedNode = LayoutNode & Point & { side: LabelSide };

export type PlacedEdge = { key: string; edge: AgentEdge; d: string; mid: Point; width: number };

export type PlacedGraph = {
    orientation: Orientation;
    width: number;
    height: number;
    nodes: PlacedNode[];
    edges: PlacedEdge[];
};

export const SQUARE = 14;
// Room for the labels beside the first and last layer
const LABEL_ROOM = 150;
const ROW_PITCH = 78;
const DOWN_EDGE = 54;
const DOWN_GAP = 190;

export function orientationFor(width: number): Orientation {
    return width < 600 ? "down" : "across";
}

function cubicMid(p: number[][]): number[] {
    return [0, 1].map((i) => (p[0][i] + 3 * p[1][i] + 3 * p[2][i] + p[3][i]) / 8);
}

// Positions nodes in pixels and draws every edge as a cubic curve
export function placeGraph(layout: GraphLayout, edges: AgentEdge[], width: number): PlacedGraph {
    const orientation = orientationFor(width);
    const across = orientation === "across";
    const { layers, slots } = layout;
    const height = across ? Math.max(1, slots) * ROW_PITCH : DOWN_EDGE * 2 + Math.max(0, layers - 1) * DOWN_GAP;
    const span = across ? width - LABEL_ROOM * 2 : height - DOWN_EDGE * 2;
    const start = across ? LABEL_ROOM : DOWN_EDGE;

    // u runs along the layers, v across them
    const uOf = (layer: number) => (layers <= 1 ? start : start + (span * layer) / (layers - 1));
    const vOf = (slot: number) => (across ? (slot + 0.5) * ROW_PITCH : ((slot + 0.5) / Math.max(1, slots)) * width);
    const toXY = ([u, v]: number[]): Point => (across ? { x: u, y: v } : { x: v, y: u });

    const nodes: PlacedNode[] = layout.nodes.map((node) => ({
        ...node,
        ...toXY([uOf(node.layer), vOf(node.slot)]),
        side: node.layer === 0 && layers > 1 ? "before" : "after",
    }));
    const at = new Map(nodes.map((node) => [node.name, node]));
    const half = SQUARE / 2;

    const placed = edges.flatMap((edge): PlacedEdge[] => {
        const a = at.get(edge.from);
        const b = at.get(edge.to);
        if (!a || !b || a === b) return [];
        const paired = edges.some((other) => other.from === edge.to && other.to === edge.from);
        const flip = edge.from < edge.to ? -1 : 1;
        const [ua, va] = [uOf(a.layer), vOf(a.slot)];
        const [ub, vb] = [uOf(b.layer), vOf(b.slot)];
        let points: number[][];
        if (a.layer !== b.layer) {
            const dir = Math.sign(ub - ua);
            const o = paired ? 5 * flip : 0;
            const s = [ua + dir * (half + 2), va + o];
            const e = [ub - dir * (half + 4), vb + o];
            const bend = (e[0] - s[0]) / 2;
            points = [s, [s[0] + bend, s[1]], [e[0] - bend, e[1]], e];
        } else {
            // Same layer: bow toward the middle of the graph
            const dir = a.layer === 0 ? 1 : -1;
            const reach = 26 + Math.abs(vb - va) * 0.22 + (paired && flip > 0 ? 14 : 0);
            const s = [ua + dir * (half + 2), va];
            const e = [ub + dir * (half + 4), vb];
            points = [s, [s[0] + dir * reach, s[1]], [e[0] + dir * reach, e[1]], e];
        }
        const xy = points.map(toXY);
        const d = `M${xy[0].x} ${xy[0].y}C${xy[1].x} ${xy[1].y} ${xy[2].x} ${xy[2].y} ${xy[3].x} ${xy[3].y}`;
        return [
            {
                key: `${edge.from}>${edge.to}`,
                edge,
                d,
                mid: toXY(cubicMid(points)),
                width: edgeWidth(edge.total),
            },
        ];
    });

    return { orientation, width, height, nodes, edges: placed };
}
