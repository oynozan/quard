import { createAgentKey, revokeAgentKey } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brokenDb, newConnection, newProject, testContext } from "../test/context.ts";
import { closeRevoked } from "./keys.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("closeRevoked", () => {
    it("closes the connections of revoked keys and keeps the rest", async () => {
        const project = await newProject(test.db);
        const other = await createAgentKey(test.db, project.projectId, "other");
        const ctx = testContext(test.db);
        const revoked = newConnection(ctx, project);
        const second = newConnection(ctx, project);
        const kept = newConnection(ctx, { projectId: project.projectId, keyId: other.id });
        await revokeAgentKey(test.db, project.projectId, project.keyId);

        await closeRevoked(ctx, [other.id]);
        expect(revoked.socket.closedWith).toBeUndefined();
        await closeRevoked(ctx);

        for (const closed of [revoked, second]) {
            expect(closed.socket.closedWith).toEqual({ code: 4401, reason: "agent key revoked" });
        }
        expect(kept.socket.closedWith).toBeUndefined();
    });

    it("checks nothing when no key is connected", async () => {
        const db = brokenDb();
        const ctx = testContext(db);

        await closeRevoked(ctx);
        await closeRevoked(ctx, []);

        await db.destroy();
    });
});
