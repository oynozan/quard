import pg from "pg";
import { describe, expect, it } from "vitest";
import { startDevServer } from "./server.ts";

describe("startDevServer", () => {
    it("serves a Postgres that the pg driver can query", async () => {
        const server = await startDevServer({ port: 0 });
        const client = new pg.Client({ connectionString: server.url });
        await client.connect();

        const { rows } = await client.query("SELECT 1 + 1 AS two");

        expect(rows).toEqual([{ two: 2 }]);
        await client.end();
        await server.stop();
    }, 60_000);
});
