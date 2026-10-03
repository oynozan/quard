import { defineConfig } from "tsdown";

export default defineConfig({
    entry: ["index.ts"],
    format: "esm",
    platform: "node",
    target: "node22.12",
    // The build program leaves tests out, which keeps declaration builds small
    tsconfig: "tsconfig.build.json",
    dts: { eager: true },
    // Bundle shared code and its types so users install one package
    deps: {
        alwaysBundle: ["@quard/shared"],
        dts: { alwaysBundle: ["@quard/shared"] },
    },
});
