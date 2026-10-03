import { defineConfig } from "vitest/config";

// Every package keeps 100% coverage (see AGENTS.md)
export function packageConfig() {
    return defineConfig({
        test: {
            coverage: {
                provider: "v8",
                include: ["**/*.ts"],
                exclude: ["**/*.test.ts", "**/*.config.ts", "dist/**", "coverage/**"],
                thresholds: { 100: true },
            },
        },
    });
}
