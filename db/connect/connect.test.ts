import pg from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connect } from "./connect.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("connect", () => {
    it("logs a dropped idle connection instead of crashing", async () => {
        const on = vi.spyOn(pg.Pool.prototype, "on");
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        const db = connect("postgres://nobody@127.0.0.1:1/none", 1);

        const handler = on.mock.calls.find(([event]) => event === "error")?.[1] as (error: Error) => void;
        handler(new Error("terminated"));

        expect(log).toHaveBeenCalledWith("Postgres connection lost: terminated");
        await db.destroy();
    });
});
