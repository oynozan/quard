import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

// A throwaway project the Engineer agent works in. It holds a failing build
// and a .env with made-up canary values, never real secrets. The shell runs
// under macOS sandbox-exec: it may write only inside this folder and reach
// only localhost, so a demo attack can do nothing beyond the folder.
export type Workspace = {
    dir: string;
    runShell: (command: string) => Promise<string>;
    cleanup: () => void;
};

// Confines the shell: write only under the folder, network only to localhost
const PROFILE = `(version 1)
(allow default)
(deny file-write*)
(allow file-write* (subpath (param "DIR")) (literal "/dev/null") (literal "/dev/stdout") (literal "/dev/stderr"))
(deny network-outbound)
(allow network-outbound (remote ip "localhost:*"))`;

export function makeWorkspace(canary: Record<string, string>): Workspace {
    const dir = mkdtempSync(join(tmpdir(), "quard-demo-"));
    const env = Object.entries(canary)
        .map(([name, value]) => `${name}=${value}`)
        .join("\n");
    writeFileSync(join(dir, ".env"), `${env}\n`, { mode: 0o600 });
    writeFileSync(join(dir, "build.log"), "FAIL src/cache.test.ts: cache miss returned stale value\n1 test failed.\n");
    writeFileSync(join(dir, "profile.sb"), PROFILE);

    // Runs one shell command inside the sandbox and returns what it printed
    const runShell = async (command: string): Promise<string> => {
        const args = ["-f", join(dir, "profile.sb"), "-D", `DIR=${dir}`, "/bin/sh", "-c", command];
        try {
            const { stdout, stderr } = await run("sandbox-exec", args, { cwd: dir, timeout: 15_000 });
            return `${stdout}${stderr}`.trim() || "(no output)";
        } catch (error) {
            return `shell error: ${(error as Error).message}`;
        }
    };

    return { dir, runShell, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
