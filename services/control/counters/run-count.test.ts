import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newProject, readyConnection, testContext } from "../test/context.ts";
import { RUN, runCountMessage } from "../test/messages.ts";
import { runCount } from "./run-count.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("runCount", () => {
    it("adds to a counter of the run shared by every process in it", async () => {
        const project = await newProject(test.db);
        const ctx = testContext(test.db);
        const sender = await readyConnection(ctx, project);
        const receiver = await readyConnection(ctx, project);
        const first = runCountMessage({ counter: "cost", add: 0.25 });
        const second = runCountMessage({ counter: "cost", add: 0.5 });

        await runCount(ctx, sender.connection, first);
        await runCount(ctx, receiver.connection, second);

        expect(sender.socket.of("counted")).toEqual([{ type: "counted", id: first.id, ok: true, used: 0.25 }]);
        expect(receiver.socket.of("counted")).toEqual([{ type: "counted", id: second.id, ok: true, used: 0.75 }]);
        const rows = await test.db
            .selectFrom("run_counters")
            .select(["run_id", "counter", "used"])
            .where("project_id", "=", project.projectId)
            .execute();
        expect(rows).toEqual([{ run_id: RUN, counter: "cost", used: 0.75 }]);
    });

    it("never adds past the cap", async () => {
        const project = await newProject(test.db);
        const ctx = testContext(test.db);
        const { connection, socket } = await readyConnection(ctx, project);

        for (let n = 0; n < 3; n += 1) {
            await runCount(ctx, connection, runCountMessage({ max: 2 }));
        }

        expect(socket.of("counted").map(({ ok, used }) => ({ ok, used }))).toEqual([
            { ok: true, used: 1 },
            { ok: true, used: 2 },
            { ok: false, used: 2 },
        ]);
    });
});
