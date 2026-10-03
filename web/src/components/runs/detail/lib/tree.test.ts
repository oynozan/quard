// @vitest-environment node
import { describe, expect, it } from "vitest";
import { makeAgent } from "../../../../../test/runs-timeline-lib/steps";
import { agentTree, treeOrder, type TreeNode } from "./tree";

// The tree as nested names, easier to read than the nodes
function shape(nodes: TreeNode[]): unknown[] {
    return nodes.map((node) => (node.children.length ? [node.agent.name, shape(node.children)] : node.agent.name));
}

describe("agentTree", () => {
    it("puts roots first, each followed by its delegated agents in start order", () => {
        const agents = [
            makeAgent("planner", null),
            makeAgent("researcher", "planner"),
            makeAgent("writer", "planner"),
            makeAgent("fetcher", "researcher"),
            makeAgent("auditor", null),
        ];
        expect(shape(agentTree(agents))).toEqual([["planner", [["researcher", ["fetcher"]], "writer"]], "auditor"]);
    });

    it("treats an agent whose parent is not in the run as a root", () => {
        const agents = [makeAgent("billing", null), makeAgent("orphan", "gone")];
        expect(shape(agentTree(agents))).toEqual(["billing", "orphan"]);
    });

    it("shows an agent listed again under a later parent only once", () => {
        const agents = [makeAgent("writer", null), makeAgent("planner", null), makeAgent("writer", "planner")];
        expect(shape(agentTree(agents))).toEqual(["writer", "planner"]);
        expect(treeOrder(agents)).toEqual(["writer", "planner"]);
    });

    it("is empty for a run with no agents", () => {
        expect(agentTree([])).toEqual([]);
    });
});

describe("treeOrder", () => {
    it("walks the tree depth first", () => {
        const agents = [makeAgent("planner", null), makeAgent("auditor", null), makeAgent("researcher", "planner")];
        expect(treeOrder(agents)).toEqual(["planner", "researcher", "auditor"]);
    });

    it("adds agents caught in a parent loop at the end, so none go missing", () => {
        const agents = [makeAgent("billing", null), makeAgent("a", "b"), makeAgent("b", "a")];
        expect(treeOrder(agents)).toEqual(["billing", "a", "b"]);
    });
});
