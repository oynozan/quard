import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { connect, type Db } from "../connect/connect.ts";
import { migrateDatabase } from "../migrate/cli.ts";

export type TestDb = { url: string; db: Db; stop(): Promise<void> };

// A real Postgres in memory, reached through the normal pg driver,
// with every migration applied
export async function startTestDb(): Promise<TestDb> {
    const pglite = await PGlite.create();
    const server = new PGLiteSocketServer({ db: pglite, port: 0, host: "127.0.0.1", maxConnections: 10 });
    await server.start();
    const url = `postgres://postgres@${server.getServerConn()}/postgres`;
    await migrateDatabase(url);
    const db = connect(url, 1);
    return {
        url,
        db,
        stop: async () => {
            await db.destroy();
            await server.stop();
            // pglite-socket handles a closed socket one tick later, and still reads the database then
            await new Promise((resolve) => setImmediate(resolve));
            await pglite.close();
        },
    };
}
