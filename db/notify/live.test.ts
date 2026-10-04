import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect } from "../connect/connect.ts";
import { listeningDb, settle } from "../test/notify.ts";
import { startTestDb, type TestDb } from "../test/pglite.ts";
import { approvalsNotice, LIVE_GAP_MS, runNotices, runsNotice } from "./live.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const ids = (count: number) => Array.from({ length: count }, (_, n) => n.toString(16).padStart(32, "a"));

describe("notices", () => {
    it("name the project and topic, with run ids up to 20", () => {
        expect(JSON.parse(approvalsNotice("p1"))).toEqual({ project: "p1", topic: "approvals" });
        expect(JSON.parse(runsNotice("p1", ids(20)))).toEqual({ project: "p1", topic: "runs", runs: ids(20) });
        expect(JSON.parse(runsNotice("p1", ids(21)))).toEqual({ project: "p1", topic: "runs" });
    });
});

describe("runNotices", () => {
    it("merges the runs of each project into one notice per gap", async () => {
        const listening = await listeningDb(test.url);
        try {
            const notices = runNotices(listening.db, vi.fn(), 10);
            notices.changed("p1", ["r1", "r2"]);
            notices.changed("p2", ["r9"]);
            notices.changed("p1", ["r2", "r3"]);
            await settle();
            notices.changed("p1", ["r4"]);
            await settle();

            expect(listening.heard.map((notice) => notice.channel)).toEqual(["quard_live", "quard_live", "quard_live"]);
            expect(listening.heard.map((notice) => JSON.parse(notice.payload))).toEqual([
                { project: "p1", topic: "runs", runs: ["r1", "r2", "r3"] },
                { project: "p2", topic: "runs", runs: ["r9"] },
                { project: "p1", topic: "runs", runs: ["r4"] },
            ]);
        } finally {
            await listening.stop();
        }
    });

    it("sends what waits at once on flush, and nothing twice", async () => {
        const listening = await listeningDb(test.url);
        try {
            const notices = runNotices(listening.db, vi.fn());
            notices.changed("p1", ["r1"]);
            await notices.flush();
            await settle();
            expect(listening.heard).toHaveLength(1);

            await new Promise((resolve) => setTimeout(resolve, LIVE_GAP_MS + 10));
            expect(listening.heard).toHaveLength(1);
        } finally {
            await listening.stop();
        }
    });

    it("reports a notice that fails to send", async () => {
        const failed = vi.fn();
        // Nothing listens on port 1
        const db = connect("postgres://127.0.0.1:1/quard");
        const notices = runNotices(db, failed);
        notices.changed("p1", ["r1"]);
        await notices.flush();
        await db.destroy();

        expect(failed).toHaveBeenCalledTimes(1);
    });
});
