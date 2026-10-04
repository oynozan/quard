// The runner as a real child process
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFakeOpenAI, type Turn } from "./fake-openai.ts";
import { playgroundFolder, removeFolders } from "./folder.ts";

const PLAYGROUND = join(import.meta.dirname, "../playground");
const ATTACK: Turn[] = [
    { calls: [{ name: "readEmail", args: {} }] },
    { calls: [{ name: "payInvoice", args: { iban: "GB33 BUKB 2020 1555 5555 55", amount: 1240 } }] },
];

// Each test starts Node with the whole SDK
const SLOW = { timeout: 60_000 };

let fake: Awaited<ReturnType<typeof startFakeOpenAI>>;
let env: NodeJS.ProcessEnv;

beforeAll(async () => {
    fake = await startFakeOpenAI();
    // Set, even if empty, so sandbox/.env can't fill them in
    env = {
        ...process.env,
        OPENAI_API_KEY: "sk-test",
        OPENAI_BASE_URL: fake.url,
        TYPESAFE_API_KEY: "",
        TYPESAFE_API: "",
        QUARD_AGENT_KEY: "",
    };
});

afterAll(async () => {
    await fake.close();
    removeFolders();
});

type Ended = { code: number | null; stdout: string[]; stderr: string };

// Resolves once the process has exited by itself
function node(args: string[], extra: NodeJS.ProcessEnv = {}): Promise<Ended> {
    const child = spawn(process.execPath, args, { env: { ...env, ...extra } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    return new Promise((resolve) =>
        child.on("close", (code) => resolve({ code, stdout: stdout.trimEnd().split("\n"), stderr })),
    );
}

function resultOf(ended: Ended) {
    const last = ended.stdout.at(-1) as string;
    expect(last.startsWith("@result ")).toBe(true);
    return JSON.parse(last.slice(8));
}

// A stand-in webhook and control that answer every request
async function backend(): Promise<{ server: Server; url: string; paths: string[] }> {
    const paths: string[] = [];
    const server = createServer((request, response) => {
        paths.push(`${request.method} ${request.url}`);
        request.resume();
        response.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, paths };
}

describe("run.ts", SLOW, () => {
    it("runs the attack, prints the result last and exits by itself", async () => {
        fake.script(ATTACK);
        const ended = await node([join(PLAYGROUND, "run.ts"), playgroundFolder()]);
        expect(ended.code).toBe(0);
        const result = resultOf(ended);
        expect(result).toMatchObject({ status: "completed", recorded: false });
        expect(result.detections.map((d: { guard: string }) => d.guard)).toEqual(["source", "action"]);
    });

    it("exits with 1 and a message, and no result, without an OpenAI key", async () => {
        const ended = await node([join(PLAYGROUND, "run.ts"), playgroundFolder()], { OPENAI_API_KEY: "" });
        expect(ended.code).toBe(1);
        expect(ended.stderr).toContain("OPENAI_API_KEY");
        expect(ended.stdout.join("\n")).not.toContain("@result");
    });

    it("sends the run to the backend when it answers, and still exits by itself", async () => {
        const { server, url, paths } = await backend();
        fake.script([{ text: "Hi." }]);
        const keys = { QUARD_AGENT_KEY: "qk_test", QUARD_HASH_KEY: "ab".repeat(32) };
        const ended = await node([join(PLAYGROUND, "run.ts"), playgroundFolder()], {
            ...keys,
            QUARD_WEBHOOK_URL: url,
            QUARD_CONTROL_URL: url,
        });
        server.close();
        expect(resultOf(ended).recorded).toBe(true);
        expect(paths).toContain("POST /v1/events");
    });

    it("warns when the backend is down, and says the run is not recorded", async () => {
        const { server, url } = await backend();
        server.close();
        fake.script([{ text: "Hi." }]);
        const ended = await node([join(PLAYGROUND, "run.ts"), playgroundFolder()], {
            QUARD_AGENT_KEY: "qk_test",
            QUARD_HASH_KEY: "ab".repeat(32),
            QUARD_WEBHOOK_URL: url,
            QUARD_CONTROL_URL: url,
        });
        expect(ended.code).toBe(0);
        expect(ended.stderr).toContain(`The Quard backend at ${url} isn't answering`);
        expect(resultOf(ended).recorded).toBe(false);
    });
});
