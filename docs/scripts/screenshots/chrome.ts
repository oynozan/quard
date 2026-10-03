import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

export const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export type Chrome = { wsUrl: string; kill(): void };

type Target = { type: string; webSocketDebuggerUrl: string };

export type ChromeDeps = {
    spawn: (command: string, args: string[], options: { stdio: "ignore" }) => { kill(): unknown };
    fetch: (url: string) => Promise<{ json(): Promise<unknown> }>;
    sleep: (ms: number) => Promise<void>;
};

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Starts headless Chrome and returns the address of its first page
export async function launchChrome(
    chromePath: string,
    port: number,
    deps: ChromeDeps = { spawn, fetch, sleep },
): Promise<Chrome> {
    const profile = path.join(tmpdir(), `quard-shots-${port}`);
    const args = ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`];
    const proc = deps.spawn(chromePath, [...args, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
    for (let tries = 0; tries < 50; tries++) {
        await deps.sleep(200);
        const targets = await deps.fetch(`http://127.0.0.1:${port}/json`).then(
            (res) => res.json() as Promise<Target[]>,
            () => [] as Target[],
        );
        const page = targets.find((target) => target.type === "page");
        if (page) return { wsUrl: page.webSocketDebuggerUrl, kill: () => proc.kill() };
    }
    proc.kill();
    throw new Error(`Chrome did not start from ${chromePath}`);
}
