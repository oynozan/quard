import { defineConfig } from "vitest/config";
import { packageConfig } from "../vitest.shared.ts";

const shared = packageConfig();

// The examples are run by hand; only the playground is measured
export default defineConfig({
    ...shared,
    test: { ...shared.test, coverage: { ...shared.test?.coverage, include: ["playground/**/*.ts"] } },
});
