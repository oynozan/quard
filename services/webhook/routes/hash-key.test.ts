import { createAgentKey, createProject, revokeAgentKey } from "@quard/db";
import { projectKeys } from "@quard/db/server";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { HASH_KEY_PATH, hashKeyReply, parseHashKey, projectHashKey } from "@quard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";

const INSTALL_KEY = parseHashKey("ab".repeat(32));

let test: TestDb;
let app: ReturnType<typeof createApp>;
let projectId: string;
let key: string;

beforeAll(async () => {
    test = await startTestDb();
    app = createApp({ db: test.db, keys: projectKeys(INSTALL_KEY) });
    projectId = await createProject(test.db, "Acme");
    key = (await createAgentKey(test.db, projectId, "billing")).key;
}, 60_000);

afterAll(async () => {
    await test.stop();
});

function get(auth: string | undefined) {
    return app.request(HASH_KEY_PATH, auth === undefined ? {} : { headers: { authorization: auth } });
}

const keyOf = (project: string) => projectHashKey(INSTALL_KEY, project).toString("hex");

describe("GET /v1/hash-key", () => {
    it("gives an agent its project's hash key, never the install's, and asks that nothing keeps it", async () => {
        const res = await get(`Bearer ${key}`);

        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe("no-store");
        const reply = hashKeyReply.parse(await res.json());
        expect(reply).toEqual({ hashKey: keyOf(projectId) });
        expect(reply.hashKey).not.toBe(INSTALL_KEY.toString("hex"));
    });

    it("gives every agent key of a project the same hash key, and another project its own", async () => {
        const second = await createAgentKey(test.db, projectId, "support");
        const other = await createProject(test.db, "Other");
        const otherKey = await createAgentKey(test.db, other, "billing");

        expect(await (await get(`Bearer ${second.key}`)).json()).toEqual({ hashKey: keyOf(projectId) });
        expect(await (await get(`Bearer ${otherKey.key}`)).json()).toEqual({ hashKey: keyOf(other) });
        expect(keyOf(other)).not.toBe(keyOf(projectId));
    });

    it.each([
        ["no authorization header", undefined],
        ["no key", ""],
        ["an unknown key", "Bearer qk_live_nope"],
        ["another scheme", "Basic qk_live_nope"],
    ])("refuses a request with %s", async (_, auth) => {
        const res = await get(auth);

        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: "invalid_agent_key" });
    });

    it("refuses a revoked key", async () => {
        const revoked = await createAgentKey(test.db, projectId, "old");
        await revokeAgentKey(test.db, projectId, revoked.id);

        const res = await get(`Bearer ${revoked.key}`);

        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: "invalid_agent_key" });
    });
});
