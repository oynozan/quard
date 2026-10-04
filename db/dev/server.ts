import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

export type DevServer = { url: string; stop(): Promise<void> };

// pglite-socket 0.2.11 never frees the slot of a connection that ended in
// an error, such as a client process that was killed. With a small cap,
// enough of those lock every new client out.
// ponytail: high cap, not a fix; prune slots if pglite-socket starts to free them
const MAX_CONNECTIONS = 10_000;

// A Postgres for local development without Docker, using PGlite.
// Development only: PGlite runs one query at a time for every connection.
export async function startDevServer(options: { dataDir?: string; port: number }): Promise<DevServer> {
    const db = await PGlite.create(options.dataDir);
    const server = new PGLiteSocketServer({
        db,
        port: options.port,
        host: "127.0.0.1",
        maxConnections: MAX_CONNECTIONS,
    });
    await server.start();
    return {
        url: `postgres://postgres@${server.getServerConn()}/postgres`,
        stop: async () => {
            await server.stop();
            // pglite-socket handles a closed socket one tick later, and still reads the database then
            await new Promise((resolve) => setImmediate(resolve));
            await db.close();
        },
    };
}
