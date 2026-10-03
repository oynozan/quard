import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { serve, type ServerType } from "@hono/node-server";
import { agentMessageLinks } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../webhook/app.ts";
import { newProject, type TestProject } from "../test/context.ts";
import { REDACTOR } from "../test/messages.ts";
import { startTestControl, type TestControl } from "../test/server.ts";

// The M4 acceptance test: an orchestrator in one process delegates to a
// billing agent in another, through the real webhook, control and PGlite

const APP = join(import.meta.dirname, "..", "..", "..", "packages", "sdk", "test", "fixtures", "agent-process.ts");
const WAIT = { timeout: 10_000, interval: 50 };

let test: TestDb;
let control: TestControl;
let webhook: ServerType;
let webhookUrl: string;
let project: TestProject;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

beforeEach(async () => {
    project = await newProject(test.db);
    control = await startTestControl(test);
    const app = createApp({ db: test.db, redactor: REDACTOR });
    webhook = await new Promise<ServerType>((resolve) => {
        const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, () => resolve(server));
    });
    webhookUrl = `http://127.0.0.1:${(webhook.address() as AddressInfo).port}`;
});

afterEach(async () => {
    await new Promise((resolve) => webhook.close(resolve));
    await control.close();
});

afterAll(async () => {
    await test.stop();
});

// Runs one agent process, and stops it when it is still alive after 15 s
function runAgent(env: Record<string, string>): Promise<{ code: number | null; output: string }> {
    const child = spawn(process.execPath, [APP], {
        env: {
            ...process.env,
            QUARD_TEST_KEY: project.key,
            QUARD_TEST_WEBHOOK_URL: webhookUrl,
            QUARD_TEST_CONTROL_URL: `http://127.0.0.1:${control.port}`,
            ...env,
        },
        stdio: ["ignore", "pipe", "pipe"],
    });
    const stuck = setTimeout(() => child.kill(), 15_000);
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

async function delegate(source: "web" | "supplier"): Promise<{ runId: string; paid: string }> {
    const sender = await runAgent({ QUARD_TEST_MODE: "send", QUARD_TEST_SOURCE: source });
    expect(sender.code, sender.output).toBe(0);
    const { baggage } = JSON.parse(sender.output.trim()) as { baggage: string };
    const receiver = await runAgent({ QUARD_TEST_MODE: "receive", QUARD_TEST_MESSAGE: sender.output.trim() });
    expect(receiver.code, receiver.output).toBe(0);
    return { runId: /quard-run=([0-9a-f]{32})/.exec(baggage)?.[1] as string, paid: receiver.output.trim() };
}

function blocks(runId: string) {
    return test.db
        .selectFrom("decisions")
        .select(["agent", "guard", "decision", "reason"])
        .where("project_id", "=", project.projectId)
        .where("run_id", "=", runId)
        .where("decision", "=", "block")
        .execute();
}

describe("M4: an orchestrator delegates to an agent in another process", { timeout: 60_000 }, () => {
    it("blocks a web-derived IBAN from the brief in the second agent's payment", async () => {
        const { runId, paid } = await delegate("web");

        expect(paid).toBe("blocked");
        // The record went through webhook with the IBAN only as a hash
        const record = await test.db
            .selectFrom("message_records")
            .selectAll()
            .where("project_id", "=", project.projectId)
            .executeTakeFirstOrThrow();
        expect(record).toMatchObject({ run_id: runId, sender: "orchestrator", depth: 0 });
        expect(JSON.stringify(record)).not.toContain("DE89");
        // Both processes' events land in one run, named after the orchestrator
        await vi.waitFor(async () => expect(await blocks(runId)).toHaveLength(1), WAIT);
        expect(await blocks(runId)).toEqual([
            { agent: "billing", guard: "action", decision: "block", reason: "value_not_from_allowed_origin" },
        ]);
        const run = await test.db
            .selectFrom("runs")
            .select("agent")
            .where("project_id", "=", project.projectId)
            .where("run_id", "=", runId)
            .executeTakeFirstOrThrow();
        expect(run.agent).toBe("orchestrator");
        // The agent graph shows the message, carrying untrusted content
        await vi.waitFor(async () => {
            const links = await agentMessageLinks(test.db, project.projectId, { since: new Date(0) });
            expect(links).toMatchObject([{ from: "orchestrator", to: "billing", messages: 1, untrusted: 1 }]);
        }, WAIT);
    });

    it("pays an IBAN from the supplier records, because its label travels with the brief", async () => {
        const { runId, paid } = await delegate("supplier");

        expect(paid).toBe("paid 4950");
        await vi.waitFor(async () => {
            const links = await agentMessageLinks(test.db, project.projectId, { since: new Date(0) });
            expect(links).toMatchObject([{ from: "orchestrator", to: "billing", messages: 1, untrusted: 0 }]);
        }, WAIT);
        expect(await blocks(runId)).toEqual([]);
    });
});
