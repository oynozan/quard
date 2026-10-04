import type { RunAgent } from "@/lib/data/runs/types";

export type TreeNode = { agent: RunAgent; children: TreeNode[] };

// Roots first, each followed by its delegated agents, in the order they started.
export function agentTree(agents: RunAgent[]): TreeNode[] {
    const names = new Set(agents.map((agent) => agent.name));
    const seen = new Set<string>();
    const build = (parent: string | null): TreeNode[] =>
        agents
            .filter((agent) =>
                parent === null ? agent.parent === null || !names.has(agent.parent) : agent.parent === parent,
            )
            .filter((agent) => !seen.has(agent.name))
            .map(nodeOf);
    const nodeOf = (agent: RunAgent): TreeNode => {
        seen.add(agent.name);
        return { agent, children: build(agent.name) };
    };
    const tree = build(null);
    // A parent loop has no root, so the agent in it that started first stands in for one
    for (const agent of agents) if (!seen.has(agent.name)) tree.push(nodeOf(agent));
    return tree;
}

export function treeOrder(agents: RunAgent[]): string[] {
    const out: string[] = [];
    const walk = (nodes: TreeNode[]) =>
        nodes.forEach((node) => {
            out.push(node.agent.name);
            walk(node.children);
        });
    walk(agentTree(agents));
    return out;
}
