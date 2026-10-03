import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

export type DevServer = { url: string; stop(): Promise<void> };

// A Postgres for local development without Docker, using PGlite.
// Development only: PGlite runs one query at a time for every connection.
export async function startDevServer(options: { dataDir?: string; port: number }): Promise<DevServer> {
    const db = await PGlite.create(options.dataDir);
    const server = new PGLiteSocketServer({ db, port: options.port, host: "127.0.0.1", maxConnections: 20 });
    await server.start();
    return {
        url: `postgres://postgres@${server.getServerConn()}/postgres`,
        stop: async () => {
            await server.stop();
            await db.close();
        },
    };
}
