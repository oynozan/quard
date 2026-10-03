import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const EXAMPLES = join(import.meta.dirname, "..", "examples");

export function tempDir(): string {
    return mkdtempSync(join(tmpdir(), "quard-test-"));
}

// Writes JSON, or text as it is, and returns the path
export function writeJson(path: string, value: unknown): string {
    writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value, null, 4));
    return path;
}

// A tiny parser for feed tests: {"n": number} gives n
export function parseN(text: string): number {
    const value = JSON.parse(text) as { n?: unknown };
    if (typeof value.n !== "number") {
        throw new Error("n must be a number");
    }
    return value.n;
}
