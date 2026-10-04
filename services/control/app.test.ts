import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const app = () => createApp({ db: test.db, log: () => {} });

describe("control app", () => {
    it("serves the health route", async () => {
        const res = await app().request("/health");

        expect(await res.json()).toEqual({ status: "ok", service: "control", workerSeenAt: null });
    });

    it("returns 404 for unknown paths", async () => {
        const res = await app().request("/nope");

        expect(res.status).toBe(404);
    });
});
