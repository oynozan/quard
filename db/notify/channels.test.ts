import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listeningDb, settle, type ListeningDb } from "../test/notify.ts";
import { startTestDb, type TestDb } from "../test/pglite.ts";
import { CHANNELS, notify } from "./channels.ts";

let test: TestDb;
let listening: ListeningDb;

beforeAll(async () => {
    test = await startTestDb();
    listening = await listeningDb(test.url);
}, 60_000);

afterAll(async () => {
    await listening.stop();
    await test.stop();
});

describe("notify", () => {
    it("names one channel per kind of change", () => {
        expect(CHANNELS).toEqual({
            approvals: "quard_approvals",
            fleet: "quard_fleet",
            keys: "quard_keys",
            live: "quard_live",
        });
    });

    it("sends a notification, and inside a transaction only on commit", async () => {
        await notify(listening.db, CHANNELS.keys, "key-1");
        await listening.db.transaction().execute(async (trx) => {
            await notify(trx, CHANNELS.fleet, "project-1");
        });
        await expect(
            listening.db.transaction().execute(async (trx) => {
                await notify(trx, CHANNELS.approvals, "dropped");
                throw new Error("roll back");
            }),
        ).rejects.toThrow("roll back");
        await settle();

        expect(listening.heard).toEqual([
            { channel: "quard_keys", payload: "key-1" },
            { channel: "quard_fleet", payload: "project-1" },
        ]);
    });
});
