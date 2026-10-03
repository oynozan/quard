import { hostname } from "node:os";
import { revokeAgentKey } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { guard, quard, type RunEvent } from "../../../packages/sdk/index.ts";
import type { Fetch } from "../../../packages/sdk/monitor/fetch.ts";
import { rulesHash } from "../../../packages/sdk/policy/rules.ts";
import { fakeResponses } from "../../../packages/sdk/test/fake-responses.ts";
import { resetAll } from "../../../packages/sdk/test/reset.ts";
import { activeControl } from "../../../packages/sdk/transport/link/active.ts";
import { newProject, type TestProject } from "../test/context.ts";
import { REDACTOR } from "../test/messages.ts";
import { only, startTestControl, type TestControl } from "../test/server.ts";

// Connecting, agent versions and key revocation with the real SDK, control on a free port and PGlite

const HASH_KEY = "ab".repeat(32);
const INSTRUCTIONS = "You pay invoices. Send each receipt to billing@acme.com.";
const WAIT = { timeout: 10_000, interval: 20 };

type ModelClient = { fetch: Fetch; withOptions(options: { fetch: Fetch }): ModelClient };
type ModelCall = Extract<RunEvent, { type: "model_call" }>;

let test: TestDb;
let control: TestControl;
let project: TestProject;
let events: RunEvent[] = [];

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

beforeEach(async () => {
    project = await newProject(test.db);
    control = await startTestControl(test);
    events = [];
});

afterEach(async () => {
    vi.restoreAllMocks();
    resetAll();
    await control.close();
});

afterAll(async () => {
    await test.stop();
});

function linkSdk(): void {
    quard.configure({
        key: project.key,
        controlUrl: `http://127.0.0.1:${control.port}`,
        hashKey: HASH_KEY,
        onEvent: (event) => events.push(event),
    });
}

// What quard.wrap() needs from an OpenAI client
function modelClient(fetch: Fetch): ModelClient {
    return { fetch, withOptions: (options) => modelClient(options.fetch) };
}

function connections() {
    return test.db
        .selectFrom("sdk_connections")
        .select(["sdk", "host", "pid", "rules_hash", "disconnected_at"])
        .where("project_id", "=", project.projectId)
        .execute();
}

function agentVersions() {
    return test.db
        .selectFrom("agent_versions")
        .select(["agent", "version", "model", "tools", "instructions"])
        .where("project_id", "=", project.projectId)
        .execute();
}

describe("an SDK connected to control", { timeout: 30_000 }, () => {
    it("records the connection, its rules hash and each new agent version", async () => {
        linkSdk();
        guard(async (_input: object) => "paid", { type: "approval", name: "payInvoice" });
        const client = quard.wrap(modelClient(fakeResponses(() => ({ text: "Done." })).fetch));
        const body = {
            model: "gpt-test",
            instructions: INSTRUCTIONS,
            input: "Pay invoice 114",
            tools: [{ type: "function", name: "payInvoice", parameters: {} }],
        };

        await quard.run({ agent: "billing" }, () =>
            client.fetch("https://api.openai.com/v1/responses", { method: "POST", body: JSON.stringify(body) }),
        );

        const version = await vi.waitFor(async () => only(await agentVersions()), WAIT);
        const call = events.find((event): event is ModelCall => event.type === "model_call");
        expect(version).toEqual({
            agent: "billing",
            version: call?.agentVersion,
            model: "gpt-test",
            tools: ["payInvoice"],
            instructions: REDACTOR.text(INSTRUCTIONS),
        });
        expect(version.instructions).not.toContain("billing@acme.com");
        expect(await connections()).toEqual([
            {
                sdk: "0.0.0",
                host: hostname(),
                pid: process.pid,
                rules_hash: rulesHash(),
                disconnected_at: null,
            },
        ]);
    });

    it("drops the link once its agent key is revoked, and warns once", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        linkSdk();
        await vi.waitFor(() => expect(activeControl()?.link.ready()).toBe(true), WAIT);

        await revokeAgentKey(test.db, project.projectId, project.keyId);

        await vi.waitFor(() => expect(warn).toHaveBeenCalledOnce(), WAIT);
        expect(warn).toHaveBeenCalledWith(
            "Quard: control refused the agent key. Check that the key is valid and not revoked.",
        );
        expect(activeControl()?.link.ready()).toBe(false);
        await vi.waitFor(async () => expect(only(await connections()).disconnected_at).not.toBeNull(), WAIT);
    });
});
