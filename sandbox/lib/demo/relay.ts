import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import type { IncomingMessage } from "node:http";
import { fileURLToPath } from "node:url";

// One stage of the agent chain, a process that reports the port it listens on
export type Stage = { child: ChildProcess; port: number };

export async function forkStage(entryUrl: string, name: string): Promise<Stage> {
    const child = fork(fileURLToPath(entryUrl), [name]);
    const ready = await Promise.race([once(child, "message"), once(child, "exit").then(() => undefined)]);
    if (ready === undefined) {
        throw new Error(`The ${name} process stopped before it was ready.`);
    }
    return { child, port: (ready[0] as { port: number }).port };
}

export async function readBody(request: IncomingMessage): Promise<string> {
    let body = "";
    for await (const chunk of request) {
        body += String(chunk);
    }
    return body;
}
