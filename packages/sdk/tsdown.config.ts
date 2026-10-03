import { defineConfig } from "tsdown";

export default defineConfig({
    // The Agents SDK integration is its own entry, so the core needs no @openai/agents
    entry: { index: "index.ts", "openai-agents": "integrations/openai-agents/index.ts" },
    format: "esm",
    platform: "node",
    target: "node22.12",
    // The build program leaves tests out and holds the shared sources, so
    // all declarations come from one TypeScript program
    tsconfig: "tsconfig.build.json",
    dts: { eager: true },
    // Bundle shared code and its types so users install one package
    deps: {
        alwaysBundle: ["@quard/shared"],
        dts: { alwaysBundle: ["@quard/shared"] },
    },
});
