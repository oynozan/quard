import { spawn, type ChildProcess } from "node:child_process";
import { connect as connectSocket } from "node:net";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export type Service = { name: string; port: number; args: string[]; cwd: string; health: string };

export const SERVICES: Service[] = [
    { name: "webhook", port: 4100, args: ["services/webhook/main.ts"], cwd: ROOT, health: "/health" },
    { name: "control", port: 4200, args: ["services/control/main.ts"], cwd: ROOT, health: "/health" },
    {
        name: "web",
        port: 3100,
        args: ["node_modules/next/dist/bin/next", "dev"],
        cwd: `${ROOT}web`,
        health: "/api/health",
    },
];

// True when something already listens on the port
export function portInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = connectSocket({ port, host: "127.0.0.1" });
        socket.once("connect", () => {
            socket.destroy();
            resolve(true);
        });
        socket.once("error", () => resolve(false));
    });
}

// Starts one service, with each line of its output marked with its name
export function start(service: Service, env: NodeJS.ProcessEnv): ChildProcess {
    const child = spawn(process.execPath, service.args, {
        cwd: service.cwd,
        env: { ...env, PORT: String(service.port) },
        stdio: ["ignore", "pipe", "pipe"],
    });
    const mark = `[${service.name}]`.padEnd(10);
    for (const stream of [child.stdout, child.stderr]) {
        let rest = "";
        stream.setEncoding("utf8");
        stream.on("data", (chunk: string) => {
            const lines = (rest + chunk).split("\n");
            rest = lines.pop() ?? "";
            for (const line of lines) {
                console.log(`${mark}${line}`);
            }
        });
    }
    return child;
}

// Waits until the service answers its health route, or gives up when it exits
export async function waitUntilUp(service: Service, child: ChildProcess, seconds = 180): Promise<boolean> {
    for (let i = 0; i < seconds * 2; i++) {
        if (child.exitCode !== null) {
            return false;
        }
        try {
            const reply = await fetch(`http://localhost:${service.port}${service.health}`);
            if (reply.ok) {
                return true;
            }
        } catch {
            // Not listening yet
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
}
