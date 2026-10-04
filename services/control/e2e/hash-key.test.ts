import { startTestDb, type TestDb } from "@quard/db/testing";
import { HASH_KEY_PATH, hashKeyReply, projectHashKey } from "@quard/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../webhook/app.ts";
import { openClient } from "../test/client.ts";
import { newProject, type TestProject } from "../test/context.ts";
import { INSTALL_KEY, KEYS } from "../test/messages.ts";
import { startTestControl, type TestControl } from "../test/server.ts";

// An agent gets its project's hash key from control's ready or from webhook, whichever answers first

let test: TestDb;
let control: TestControl;
let project: TestProject;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

beforeEach(async () => {
    project = await newProject(test.db);
    control = await startTestControl(test);
});

afterEach(async () => {
    await control.close();
});

afterAll(async () => {
    await test.stop();
});

async function fromControl(key: string): Promise<string> {
    const client = await openClient(control.port, key);
    const ready = await client.hello();
    await client.close();
    return ready.hashKey;
}

async function fromWebhook(key: string): Promise<string> {
    const webhook = createApp({ db: test.db, keys: KEYS });
    const res = await webhook.request(HASH_KEY_PATH, { headers: { authorization: `Bearer ${key}` } });
    expect(res.status).toBe(200);
    return hashKeyReply.parse(await res.json()).hashKey;
}

describe("the project's hash key", { timeout: 30_000 }, () => {
    it("is the same from control and from webhook, and never the install's", async () => {
        const hashKey = await fromControl(project.key);

        expect(await fromWebhook(project.key)).toBe(hashKey);
        expect(hashKey).toBe(projectHashKey(INSTALL_KEY, project.projectId).toString("hex"));
        expect(hashKey).not.toBe(INSTALL_KEY.toString("hex"));
    });

    it("differs between projects", async () => {
        const other = await newProject(test.db, "Other");

        expect(await fromControl(other.key)).not.toBe(await fromControl(project.key));
        expect(await fromWebhook(other.key)).not.toBe(await fromWebhook(project.key));
    });
});
