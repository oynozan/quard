import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SDK_VERSION } from "./version.ts";

describe("SDK_VERSION", () => {
    it("matches package.json", () => {
        const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "package.json"), "utf8")) as {
            version: string;
        };

        expect(SDK_VERSION).toBe(pkg.version);
    });
});
