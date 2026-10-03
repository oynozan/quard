import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [tsconfigPaths(), react()],
    // Next maps "server-only" to an empty module on the server; tests do the same
    resolve: { alias: { "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)) } },
    test: {
        environment: "jsdom",
        setupFiles: ["./test/setup.ts"],
        passWithNoTests: true,
        // The biggest renders are slow while every package's tests run at once
        testTimeout: 30_000,
        coverage: {
            provider: "v8",
            include: ["src/**/*.{ts,tsx}"],
            exclude: ["src/**/*.test.{ts,tsx}"],
            // Every package keeps 100% coverage (see AGENTS.md)
            thresholds: { 100: true },
        },
    },
});
