import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
    // web/ has its own ESLint setup; sandbox/ is a local, gitignored playground
    globalIgnores(["**/node_modules/**", "**/dist/**", "**/coverage/**", "web/**", "sandbox/**"]),
    js.configs.recommended,
    tseslint.configs.recommended,
    {
        rules: {
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        },
    },
]);
