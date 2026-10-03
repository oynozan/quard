import { defineConfig } from "vitest/config";

// Every package keeps 100% coverage (see AGENTS.md)
export function packageConfig() {
    return defineConfig({
        test: {
            // The workspace runs every package at once, so heavy tests get room on a busy machine
            testTimeout: 15_000,
            coverage: {
                provider: "v8",
                include: ["**/*.ts"],
                exclude: ["**/*.test.ts", "**/*.config.ts", "test/**", "dist/**", "coverage/**"],
                thresholds: { 100: true },
            },
        },
    });
}
