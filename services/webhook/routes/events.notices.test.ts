import { createAgentKey, createProject } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { createRedactor, parseHashKey } from "@quard/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const notices = vi.hoisted(() => ({ changed: vi.fn(), failed: undefined as ((error: Error) => void) | undefined }));
vi.mock("@quard/db", async (original) => ({
    ...(await original<object>()),
    runNotices: (_db: unknown, failed: (error: Error) => void) => {
        notices.failed = failed;
        return { changed: notices.changed, flush: async () => {} };
    },
}));

const { createApp } = await import("../app.ts");

const RUN = "1".repeat(32);
const AT = "2026-10-03T12:00:00.000Z";

let test: TestDb;
let app: ReturnType<typeof createApp>;
let projectId: string;
let key: string;

beforeAll(async () => {
    test = await startTestDb();
    app = createApp({ db: test.db, redactor: createRedactor(parseHashKey("ab".repeat(32))) });
    projectId = await createProject(test.db, "Acme");
    key = (await createAgentKey(test.db, projectId, "billing")).key;
}, 60_000);

afterAll(async () => {
    await test.stop();
});

function post(body: unknown) {
    return app.request("/v1/events", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("dashboard notices from POST /v1/events", () => {
    it("name the runs a batch stored, and nothing for a resent batch", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const batch = {
            events: [
                { id: "a".repeat(16), event: { type: "config_error", at: AT, source: "signatures", message: "x" } },
                {
                    id: "b".repeat(16),
                    event: { type: "run_started", runId: RUN, agent: "billing", at: AT, origins: {} },
                },
            ],
        };

        expect(await (await post(batch)).json()).toEqual({ received: 2, stored: 1 });
        expect(await (await post(batch)).json()).toEqual({ received: 2, stored: 0 });

        expect(notices.changed).toHaveBeenCalledTimes(1);
        expect(notices.changed).toHaveBeenCalledWith(projectId, [RUN]);
        warn.mockRestore();
    });

    it("logs a notice that failed to send", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        notices.failed?.(new Error("down"));

        expect(warn).toHaveBeenCalledWith("webhook: a dashboard notice failed: down");
        warn.mockRestore();
    });
});
