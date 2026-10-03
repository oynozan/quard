import { spawn } from "node:child_process";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONTROL_KEY, startControlServer, type ControlServer } from "../test/control-server.ts";

// The link never keeps an app alive by itself, only while a call waits

const APP = join(import.meta.dirname, "..", "test", "fixtures", "linked-app.ts");

let server: ControlServer;

beforeEach(async () => {
    server = await startControlServer();
});

afterEach(async () => {
    await server.close();
});

// Runs the app, and stops it when it is still alive after 10 s
function runApp(mode: "idle" | "approve", url = server.url): Promise<{ code: number | null; output: string }> {
    const env = {
        ...process.env,
        QUARD_TEST_MODE: mode,
        QUARD_TEST_KEY: CONTROL_KEY,
        QUARD_TEST_CONTROL_URL: url,
    };
    const child = spawn(process.execPath, [APP], { env, stdio: ["ignore", "pipe", "pipe"] });
    const stuck = setTimeout(() => child.kill(), 10_000);
    let output = "";
    child.stdout.on("data", (data) => (output += String(data)));
    child.stderr.on("data", (data) => (output += String(data)));
    return new Promise((resolve) =>
        child.on("exit", (code) => {
            clearTimeout(stuck);
            resolve({ code, output });
        }),
    );
}

describe("an app with a control link", () => {
    it("exits once its own work is done, while the link is still connected", { timeout: 20_000 }, async () => {
        const result = await runApp("idle");

        expect(result).toEqual({ code: 0, output: "work done\n" });
        expect(server.received.map((message) => message.type)).toContain("hello");
    });

    it("exits when it reaches control through a second address of the host", { timeout: 20_000 }, async () => {
        // localhost tries ::1 first, while control only listens on 127.0.0.1
        const result = await runApp("idle", server.url.replace("127.0.0.1", "localhost"));

        expect(result).toEqual({ code: 0, output: "work done\n" });
        expect(server.received.map((message) => message.type)).toContain("hello");
    });

    it("stays alive while a call waits for approval, then exits", { timeout: 20_000 }, async () => {
        const running = runApp("approve");
        const ask = await server.waitFor("ask");
        await new Promise((resolve) => setTimeout(resolve, 300));
        server.decide(ask.askId, "once");

        expect(await running).toEqual({ code: 0, output: "paid 4950\n" });
    });
});
