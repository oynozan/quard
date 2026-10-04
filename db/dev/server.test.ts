import net from "node:net";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { startDevServer } from "./server.ts";

// Opens a connection, then resets it, as a process that was killed would
function dropAbruptly(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const socket = net.connect(port, "127.0.0.1", () => {
            setTimeout(() => {
                socket.resetAndDestroy();
                resolve();
            }, 20);
        });
        socket.on("error", reject);
    });
}

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

    it("keeps taking connections after many clients drop without closing", async () => {
        const server = await startDevServer({ port: 0 });
        for (let i = 0; i < 25; i++) {
            await dropAbruptly(Number(new URL(server.url).port));
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        const client = new pg.Client({ connectionString: server.url });
        await client.connect();

        const { rows } = await client.query("SELECT 1 AS one");

        expect(rows).toEqual([{ one: 1 }]);
        await client.end();
        await server.stop();
    }, 60_000);
});
