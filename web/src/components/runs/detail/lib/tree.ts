import type { RunAgent } from "@/lib/data/runs/types";

export type TreeNode = { agent: RunAgent; children: TreeNode[] };

// Roots first, each followed by its delegated agents, in the order they started.
export function agentTree(agents: RunAgent[]): TreeNode[] {
    const names = new Set(agents.map((agent) => agent.name));
    const build = (parent: string | null, seen: Set<string>): TreeNode[] =>
        agents
            .filter((agent) =>
                parent === null ? agent.parent === null || !names.has(agent.parent) : agent.parent === parent,
            )
            .filter((agent) => !seen.has(agent.name))
            .map((agent) => {
                seen.add(agent.name);
                return { agent, children: build(agent.name, seen) };
            });
    return build(null, new Set());
}

export function treeOrder(agents: RunAgent[]): string[] {
    const out: string[] = [];
    const walk = (nodes: TreeNode[]) =>
        nodes.forEach((node) => {
            out.push(node.agent.name);
            walk(node.children);
        });
    walk(agentTree(agents));
    for (const agent of agents) if (!out.includes(agent.name)) out.push(agent.name);
    return out;
}
