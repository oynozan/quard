import { defineConfig } from "tsdown";

export default defineConfig({
    entry: ["index.ts"],
    format: "esm",
    platform: "node",
    target: "node22.12",
    dts: true,
    // Bundle shared code so users install one package
    noExternal: ["@quard/shared"],
});
