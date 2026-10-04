import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULTS = join(import.meta.dirname, "../playground");

type Name = "scenario" | "policy" | "signatures";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defaults(name: Name): Record<string, any> {
    return JSON.parse(readFileSync(join(DEFAULTS, `${name}.json`), "utf8"));
}

const made: string[] = [];

export function emptyFolder(): string {
    const dir = mkdtempSync(join(tmpdir(), "quard-playground-"));
    made.push(dir);
    return dir;
}

// A temporary folder with the default files, with some of them replaced
export function playgroundFolder(changes: Partial<Record<Name, object>> = {}): string {
    const dir = emptyFolder();
    for (const name of ["scenario", "policy", "signatures"] as const) {
        writeFileSync(join(dir, `${name}.json`), JSON.stringify(changes[name] ?? defaults(name)));
    }
    return dir;
}

export function removeFolders(): void {
    made.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
}
