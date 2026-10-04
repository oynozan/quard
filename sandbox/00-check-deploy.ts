// 00 · Check an install end to end
//
// One command that checks every part of a Quard install, on your machine
// or on a server, in a few seconds:
//
//   dashboard   the sign-in page loads
//   docs        the docs site loads (only with QUARD_DOCS_URL)
//   webhook     answers /health as webhook
//   control     answers /health as control
//   worker      control's /health saw it in the last 30 s
//   live link   control opens the WebSocket for the agent key
//   hash key    webhook gives the agent key its project's hash key
//   model call  one wrapped model call (only with OPENAI_API_KEY)
//   run         one real run reaches webhook and every event is stored
//
// Settings come from sandbox/.env, and values already set win:
//
//   QUARD_AGENT_KEY       made in that install's dashboard: Settings > Create key
//   QUARD_DASHBOARD_URL   http://localhost:3100 when unset
//   QUARD_DOCS_URL        not checked when unset
//   QUARD_WEBHOOK_URL     http://localhost:4100 when unset
//   QUARD_CONTROL_URL     http://localhost:4200 when unset
//
// To check a server, keep its settings in sandbox/.env.deploy and run:
//
//   node --env-file=sandbox/.env.deploy sandbox/00-check-deploy.ts
//
// The run shows up in that dashboard under the agent deploy-check. The
// command exits with 1 when a check fails.
//
// Run: node sandbox/00-check-deploy.ts

import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { CONTROL_PATH, HASH_KEY_PATH, hashKeyReply } from "@quard/shared";
import OpenAI from "openai";
import { guard, quard } from "quard";

try {
    process.loadEnvFile(new URL(".env", import.meta.url));
} catch {
    // No sandbox/.env; the settings may still be in the environment
}

const env = process.env;
const KEY = env.QUARD_AGENT_KEY ?? "";
const DASHBOARD = trimmed(env.QUARD_DASHBOARD_URL || "http://localhost:3100");
const DOCS = env.QUARD_DOCS_URL ? trimmed(env.QUARD_DOCS_URL) : undefined;
const WEBHOOK = trimmed(env.QUARD_WEBHOOK_URL || "http://localhost:4100");
const CONTROL = trimmed(env.QUARD_CONTROL_URL || "http://localhost:4200");
const MODEL = env.OPENAI_MODEL || "gpt-5.4-mini";
const TIMEOUT = 5_000;
const UPLOAD_WAIT = 10_000;
// A worker that checked in within this long is running
const WORKER_SEEN = 30_000;

let checks = 0;
let failed = 0;

function trimmed(url: string): string {
    return url.replace(/\/+$/, "");
}

// One line per check; a problem of undefined means it passed
function report(name: string, problem: string | undefined, detail: string): void {
    checks += 1;
    if (problem !== undefined) failed += 1;
    console.log(`  ${problem === undefined ? "✓" : "✗"} ${name.padEnd(12)}${problem ?? detail}`);
}

function skip(name: string, detail: string): void {
    console.log(`  · ${name.padEnd(12)}${detail}`);
}

// What went wrong with a request, in a few words
function reason(error: unknown): string {
    const { name, message, cause } = error as Error & { cause?: { code?: string; message?: string } };
    if (name === "TimeoutError") return `no answer within ${TIMEOUT / 1000} s`;
    return cause?.code ?? cause?.message ?? message;
}

// A page that must answer 200 without a session
async function page(url: string): Promise<string | undefined> {
    try {
        const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT) });
        await res.body?.cancel();
        return res.status === 200 ? undefined : `${url} answered ${res.status}`;
    } catch (error) {
        return `${url}: ${reason(error)}`;
    }
}

// Both services answer /health with their own name, which also catches swapped proxy routes
async function health(url: string, service: string): Promise<string | undefined> {
    try {
        const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(TIMEOUT) });
        const body = (await res.json().catch(() => undefined)) as { status?: string; service?: string } | undefined;
        if (body?.status === "ok" && body.service === service) return undefined;
        if (body?.service !== undefined) return `${url} is ${body.service}, not ${service}`;
        return `${url}/health answered ${res.status}`;
    } catch (error) {
        return `${url}: ${reason(error)}`;
    }
}

// The worker answers no requests, so control's /health says when it last checked in
async function checkWorker(): Promise<void> {
    let seenAt: string | null | undefined;
    try {
        const res = await fetch(`${CONTROL}/health`, { signal: AbortSignal.timeout(TIMEOUT) });
        seenAt = ((await res.json()) as { workerSeenAt?: string | null }).workerSeenAt;
    } catch (error) {
        return report("Worker", `${CONTROL}: ${reason(error)}`, "");
    }
    const ago = seenAt ? Math.max(0, Date.now() - Date.parse(seenAt)) : Infinity;
    const problem = ago <= WORKER_SEEN ? undefined : "no worker seen; start it as sandbox/README.md shows";
    report("Worker", problem, `seen ${Math.round(ago / 1000)} s ago`);
}

// Opens the control WebSocket the way the SDK does and closes it again
function liveLink(): Promise<string | undefined> {
    const url = new URL(`${CONTROL}${CONTROL_PATH}`);
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    return new Promise((resolve) => {
        const req = send(url, {
            timeout: TIMEOUT,
            headers: {
                authorization: `Bearer ${KEY}`,
                connection: "Upgrade",
                upgrade: "websocket",
                "sec-websocket-version": "13",
                "sec-websocket-key": randomBytes(16).toString("base64"),
            },
        });
        req.on("upgrade", (_res, socket) => {
            socket.destroy();
            resolve(undefined);
        });
        req.on("response", (res) => {
            res.resume();
            if (res.statusCode === 401) return resolve("control refused the agent key");
            resolve(`answered ${res.statusCode}; the proxy must pass the Upgrade and Connection headers`);
        });
        req.on("timeout", () => req.destroy(new Error(`no answer within ${TIMEOUT / 1000} s`)));
        req.on("error", (error) => resolve(reason(error)));
        req.end();
    });
}

// The project's hash key, asked for the way the SDK asks webhook
async function hashKey(): Promise<string | undefined> {
    const url = `${WEBHOOK}${HASH_KEY_PATH}`;
    try {
        const res = await fetch(url, {
            headers: { authorization: `Bearer ${KEY}` },
            signal: AbortSignal.timeout(TIMEOUT),
        });
        const body: unknown = await res.json().catch(() => undefined);
        if (res.status === 401) return "webhook refused the agent key";
        if (!res.ok) return `${url} answered ${res.status}`;
        return hashKeyReply.safeParse(body).success ? undefined : `${url} sent no valid hash key`;
    } catch (error) {
        return `${url}: ${reason(error)}`;
    }
}

console.log("Checking the Quard install");

const settings = KEY ? undefined : "set QUARD_AGENT_KEY in sandbox/.env";
report("Settings", settings, "agent key is set");

const [dashboard, docs, webhook, control] = await Promise.all([
    page(`${DASHBOARD}/sign-in`),
    DOCS === undefined ? undefined : page(DOCS),
    health(WEBHOOK, "webhook"),
    health(CONTROL, "control"),
]);
report("Dashboard", dashboard, `${DASHBOARD} loads`);
if (DOCS === undefined) skip("Docs", "not checked: set QUARD_DOCS_URL");
else report("Docs", docs, `${DOCS} loads`);
report("Webhook", webhook, WEBHOOK);
report("Control", control, CONTROL);
if (control === undefined) await checkWorker();
else skip("Worker", "not checked: control did not answer");

if (settings === undefined) {
    report("Live link", await liveLink(), "control accepts the agent key");
    report("Hash key", await hashKey(), "webhook gives the agent its project's hash key");
    await checkRun();
}

console.log(failed === 0 ? `All ${checks} checks passed.` : `${failed} of ${checks} checks failed.`);
process.exit(failed === 0 ? 0 : 1);

// One real run. The SDK sends events with fetch, so wrapping fetch shows what webhook answered.
async function checkRun(): Promise<void> {
    const uploads = { received: 0, stored: 0, refused: undefined as number | undefined };
    const plainFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
        const res = await plainFetch(input, init);
        if (String(input) === `${WEBHOOK}/v1/events`) {
            if (res.ok) {
                const body = (await res.clone().json()) as { received: number; stored: number };
                uploads.received += body.received;
                uploads.stored += body.stored;
            } else {
                uploads.refused = res.status;
            }
        }
        return res;
    };

    let events = 0;
    let runId = "";
    quard.configure({
        key: KEY,
        webhookUrl: WEBHOOK,
        controlUrl: CONTROL,
        onEvent: (event) => {
            events += 1;
            if (event.type === "run_started") runId = event.runId;
        },
    });

    // A limit guard only so the call is recorded
    const checked = guard(async (_input: { step: string }) => "done", {
        type: "limit",
        name: "deployCheck",
        maxCallsPerRun: 5,
    });
    let model: string | undefined;
    await quard.run({ agent: "deploy-check" }, async () => {
        if (env.OPENAI_API_KEY) {
            try {
                await quard.wrap(new OpenAI()).responses.create({ model: MODEL, input: "Reply with one word: ready" });
            } catch (error) {
                model = (error as Error).message;
            }
        }
        await checked({ step: "deploy check" });
    });
    if (env.OPENAI_API_KEY) report("Model call", model, `${MODEL} answered`);
    else skip("Model call", "not checked: set OPENAI_API_KEY");

    const deadline = Date.now() + UPLOAD_WAIT;
    while (uploads.refused === undefined && uploads.received < events && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    let problem: string | undefined;
    if (uploads.refused === 401) problem = "webhook refused the agent key";
    else if (uploads.refused !== undefined) problem = `webhook answered ${uploads.refused}`;
    else if (uploads.received < events) problem = `webhook took ${uploads.received} of ${events} events in 10 s`;
    report("Run", problem, `${uploads.stored} events stored: ${DASHBOARD}/runs/${runId}`);
}
