// @vitest-environment node
import { describe, expect, it } from "vitest";
import { edge } from "../../../../test/agents-lib-detail/fixtures";
import { orientationFor, placeGraph } from "./graph-geometry";
import { layoutGraph } from "./graph-layout";

const delegation = edge("a", "b", { delegations: 1, handoffs: 500 });

function placed(names: string[], edges = [delegation], width = 800) {
    return placeGraph(layoutGraph(names, edges), edges, width);
}

describe("orientationFor", () => {
    it("runs layers top to bottom below 600px and left to right from 600px", () => {
        expect(orientationFor(599)).toBe("down");
        expect(orientationFor(600)).toBe("across");
    });
});

describe("placeGraph across", () => {
    it("puts the first layer after the label room and the last before it", () => {
        const graph = placed(["a", "b"]);
        expect(graph).toMatchObject({ orientation: "across", width: 800, height: 78 });
        expect(graph.nodes).toEqual([
            { name: "a", layer: 0, slot: 0, x: 150, y: 39, side: "before" },
            { name: "b", layer: 1, slot: 0, x: 650, y: 39, side: "after" },
        ]);
    });

    it("draws a link between layers as a curve from square edge to square edge", () => {
        const [link] = placed(["a", "b"]).edges;
        expect(link.key).toBe("a>b");
        expect(link.edge).toBe(delegation);
        expect(link.d).toBe("M159 39C399 39 399 39 639 39");
        expect(link.mid).toEqual({ x: 399, y: 39 });
        expect(link.width).toBe(1.5);
    });

    it("splits a pair of links running both ways so they do not overlap", () => {
        const edges = [delegation, edge("b", "a", { messages: 2 })];
        const [there, back] = placed(["a", "b"], edges).edges;
        expect(there.d).toBe("M159 34C399 34 399 34 639 34");
        expect(back.d).toBe("M641 44C401 44 401 44 161 44");
        expect(back.width).toBe(1);
    });

    it("bows links inside the first layer outward and lets labels sit after", () => {
        const edges = [edge("a", "b", { handoffs: 1 }), edge("b", "a", { handoffs: 1 })];
        const graph = placed(["a", "b"], edges);
        expect(graph.nodes.map((item) => [item.x, item.y, item.side])).toEqual([
            [150, 39, "after"],
            [150, 117, "after"],
        ]);
        const [there, back] = graph.edges;
        expect(there.d.startsWith("M159 39C")).toBe(true);
        expect(there.d.endsWith(" 161 117")).toBe(true);
        // The second of the pair reaches 14px further so the two curves part
        const reachOf = (d: string) => Number(d.split("C")[1].split(" ")[0]) - 159;
        expect(reachOf(back.d) - reachOf(there.d)).toBeCloseTo(14);
        expect(reachOf(there.d)).toBeCloseTo(26 + 78 * 0.22);
    });

    it("bows links inside a deeper layer back toward the middle", () => {
        const edges = [
            edge("a", "b", { delegations: 1 }),
            edge("a", "c", { delegations: 1 }),
            edge("b", "c", { handoffs: 1 }),
        ];
        const link = placed(["a", "b", "c"], edges).edges[2];
        expect(link.d.startsWith("M641 39C")).toBe(true);
        // Reaches 26px plus 22% of the 78px row gap, back toward the first layer
        expect(Number(link.d.split("C")[1].split(" ")[0])).toBeCloseTo(641 - (26 + 78 * 0.22));
        expect(link.d.endsWith(" 639 117")).toBe(true);
    });

    it("drops self links and links to agents off the graph", () => {
        const edges = [edge("a", "a", { messages: 3 }), edge("a", "ghost", { messages: 3 })];
        expect(placed(["a"], edges).edges).toEqual([]);
    });
});

describe("placeGraph down", () => {
    it("stacks layers top to bottom and swaps the curve's axes", () => {
        const graph = placed(["a", "b"], [delegation], 300);
        expect(graph).toMatchObject({ orientation: "down", height: 298 });
        expect(graph.nodes.map((item) => [item.x, item.y])).toEqual([
            [150, 54],
            [150, 244],
        ]);
        expect(graph.edges[0].d).toBe("M150 63C150 148 150 148 150 233");
        expect(graph.edges[0].mid).toEqual({ x: 150, y: 148 });
    });

    it("keeps a minimal height for an empty graph", () => {
        expect(placed([], [], 300)).toEqual({ orientation: "down", width: 300, height: 108, nodes: [], edges: [] });
        expect(placed([], [], 800).height).toBe(78);
    });
});
