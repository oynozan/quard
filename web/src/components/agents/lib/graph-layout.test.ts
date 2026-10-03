// @vitest-environment node
import { describe, expect, it } from "vitest";
import { edge } from "../../../../test/agents-lib-detail/fixtures";
import { layoutGraph, type GraphLayout } from "./graph-layout";

function placeOf(layout: GraphLayout, name: string) {
    const found = layout.nodes.find((item) => item.name === name);
    return found && [found.layer, found.slot];
}

describe("layoutGraph", () => {
    it("returns an empty layout for no agents", () => {
        expect(layoutGraph([], [])).toEqual({ nodes: [], layers: 0, slots: 0 });
    });

    it("keeps agents in one layer, in the given order, when nobody delegates", () => {
        const layout = layoutGraph(["a", "b", "c"], [edge("a", "b", { handoffs: 4 }), edge("b", "c", { messages: 2 })]);
        expect(layout).toEqual({
            nodes: [
                { name: "a", layer: 0, slot: 0 },
                { name: "b", layer: 0, slot: 1 },
                { name: "c", layer: 0, slot: 2 },
            ],
            layers: 1,
            slots: 3,
        });
    });

    it("puts delegates one layer deeper and agents with no links last in the first layer", () => {
        const names = ["orchestrator", "researcher", "billing", "support"];
        const edges = [
            edge("orchestrator", "researcher", { delegations: 9 }),
            edge("orchestrator", "billing", { delegations: 3 }),
        ];
        const layout = layoutGraph(names, edges);
        expect(layout.layers).toBe(2);
        expect(layout.slots).toBe(3);
        expect(placeOf(layout, "researcher")).toEqual([1, 0]);
        expect(placeOf(layout, "billing")).toEqual([1, 1]);
        // Beside its two delegates, rounded to the nearest free slot
        expect(placeOf(layout, "orchestrator")).toEqual([0, 1]);
        expect(placeOf(layout, "support")).toEqual([0, 2]);
    });

    it("centers a narrower layer against the widest one", () => {
        const edges = [
            edge("a", "b", { delegations: 1 }),
            edge("a", "c", { delegations: 1 }),
            edge("b", "d", { delegations: 1 }),
        ];
        const layout = layoutGraph(["a", "b", "c", "d"], edges);
        expect(layout.layers).toBe(3);
        expect(placeOf(layout, "d")).toEqual([2, 0.5]);
        expect(layout.slots).toBe(2);
    });

    it("orders a layer by where its neighbors sit in the layer before", () => {
        // x comes before y in the names, but y's delegator sits first
        const edges = [edge("p", "y", { delegations: 1 }), edge("q", "x", { delegations: 1 })];
        const layout = layoutGraph(["p", "q", "x", "y"], edges);
        expect(placeOf(layout, "y")).toEqual([1, 0]);
        expect(placeOf(layout, "x")).toEqual([1, 1]);
    });

    it("stops a delegation loop instead of pushing agents deeper forever", () => {
        const edges = [
            edge("a", "b", { delegations: 1 }),
            edge("b", "c", { delegations: 1 }),
            edge("c", "a", { delegations: 1 }),
        ];
        const layout = layoutGraph(["a", "b", "c", "d"], edges);
        expect(layout.nodes.map((item) => [item.name, item.layer])).toEqual([
            ["a", 3],
            ["b", 1],
            ["c", 2],
            ["d", 0],
        ]);
        // b has no link to d, the only agent in the layer before it
        expect(placeOf(layout, "b")).toEqual([1, 0]);
        expect(layout.slots).toBe(1);
    });

    it("ignores self delegations and links to agents off the graph", () => {
        const edges = [edge("a", "a", { delegations: 5 }), edge("a", "ghost", { delegations: 2 })];
        expect(layoutGraph(["a"], edges)).toEqual({ nodes: [{ name: "a", layer: 0, slot: 0 }], layers: 1, slots: 1 });
    });

    it("still moves an agent one layer deep when an unknown agent delegates to it", () => {
        const layout = layoutGraph(["a", "b"], [edge("ghost", "a", { delegations: 1 })]);
        expect(placeOf(layout, "a")).toEqual([1, 0]);
        expect(placeOf(layout, "b")).toEqual([0, 0]);
    });
});
