import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    test: {
        environment: "jsdom",
        coverage: {
            provider: "v8",
            include: [
                "app/**/*.{ts,tsx}",
                "checks/**/*.ts",
                "components/**/*.{ts,tsx}",
                "theme/**/*.ts",
                "mdx-components.tsx",
                "scripts/**/*.ts",
            ],
            exclude: ["**/*.test.{ts,tsx}"],
            // Every package keeps 100% coverage (see AGENTS.md)
            thresholds: { 100: true },
        },
    },
});
