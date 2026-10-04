import type { AgentEdge } from "@/lib/data/agents";

// A node's place in the layered layout: its layer (how deep work was passed) and its slot across that layer
export type LayoutNode = { name: string; layer: number; slot: number };

export type GraphLayout = { nodes: LayoutNode[]; layers: number; slots: number };

// Delegations, including ones across processes, and messages set the layers.
// Handoffs never push an agent deeper. Busiest links go first, and one that
// would close a loop, such as a reply, is left out.
function layersOf(names: string[], edges: AgentEdge[]): Map<string, number> {
    const into = new Map<string, string[]>();
    const outOf = new Map<string, string[]>();
    const reaches = (from: string, to: string, seen: Set<string>): boolean => {
        if (from === to) return true;
        if (seen.has(from)) return false;
        seen.add(from);
        return (outOf.get(from) ?? []).some((next) => reaches(next, to, seen));
    };
    const ranked = edges
        .filter((edge) => edge.delegations + edge.messages > 0 && edge.from !== edge.to)
        .sort((a, b) => b.delegations - a.delegations || b.messages - a.messages);
    for (const edge of ranked) {
        if (reaches(edge.to, edge.from, new Set())) continue;
        outOf.set(edge.from, [...(outOf.get(edge.from) ?? []), edge.to]);
        into.set(edge.to, [...(into.get(edge.to) ?? []), edge.from]);
    }
    // The longest path from an agent nothing leads into
    const layer = new Map<string, number>();
    const depth = (name: string): number => {
        const known = layer.get(name);
        if (known !== undefined) return known;
        const value = Math.max(0, ...(into.get(name) ?? []).map((from) => depth(from) + 1));
        layer.set(name, value);
        return value;
    };
    return new Map(names.map((name) => [name, depth(name)]));
}

function mean(values: number[]): number | null {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

// Spreads wanted positions so no two nodes in a layer share a slot
function spread(wanted: { name: string; at: number }[]): Map<string, number> {
    const sorted = [...wanted].sort((a, b) => a.at - b.at);
    const out = new Map<string, number>();
    let last = -1;
    for (const item of sorted) {
        const slot = Math.max(Number.isFinite(item.at) ? Math.round(item.at) : last + 1, last + 1);
        out.set(item.name, slot);
        last = slot;
    }
    return out;
}

// Places agents in layers and orders each layer to keep links short
export function layoutGraph(names: string[], edges: AgentEdge[]): GraphLayout {
    if (names.length === 0) return { nodes: [], layers: 0, slots: 0 };
    const layerOf = layersOf(names, edges);
    const layers = Math.max(...layerOf.values()) + 1;
    const byLayer = Array.from({ length: layers }, (_, i) => names.filter((name) => layerOf.get(name) === i));
    const linked = (a: string, b: string) =>
        edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));

    const slot = new Map<string, number>();
    if (layers === 1) {
        byLayer[0].forEach((name, i) => slot.set(name, i));
    } else {
        // Deeper layers first: order by where their neighbors in the layer before sit
        for (let i = 1; i < layers; i++) {
            const before = byLayer[i - 1];
            const wanted = byLayer[i].map((name, order) => {
                const near = before.map((other, j) => (linked(name, other) ? j : -1)).filter((j) => j >= 0);
                return { name, at: (mean(near) ?? before.length) + order / 1000 };
            });
            byLayer[i] = wanted.sort((a, b) => a.at - b.at).map((item) => item.name);
        }
        const widest = Math.max(...byLayer.slice(1).map((layer) => layer.length));
        for (let i = 1; i < layers; i++) {
            const offset = (widest - byLayer[i].length) / 2;
            byLayer[i].forEach((name, j) => slot.set(name, j + offset));
        }
        // The first layer sits beside the agents it talks to; agents with no links go last
        const wanted = byLayer[0].map((name) => {
            const near = names.filter((other) => layerOf.get(other) === 1 && linked(name, other));
            return { name, at: mean(near.map((other) => slot.get(other)!)) ?? Infinity };
        });
        spread(wanted).forEach((value, name) => slot.set(name, value));
    }

    // Every name has a layer and a slot by now
    const nodes = names.map((name) => ({ name, layer: layerOf.get(name)!, slot: slot.get(name)! }));
    const low = Math.min(...nodes.map((node) => node.slot));
    const shifted = nodes.map((node) => ({ ...node, slot: node.slot - low }));
    return { nodes: shifted, layers, slots: Math.max(...shifted.map((node) => node.slot)) + 1 };
}
