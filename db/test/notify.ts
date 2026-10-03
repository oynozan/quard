import { Kysely, PostgresDialect, type PostgresPool } from "kysely";
import pg from "pg";
import type { Db } from "../connect/connect.ts";
import { CHANNELS } from "../notify/channels.ts";
import type { Database } from "../schema/database.ts";

export type Heard = { channel: string; payload: string };

export type ListeningDb = { db: Db; heard: Heard[]; stop(): Promise<void> };

// A Db that runs every query on one connection that also listens on every
// channel. PGlite only delivers a notification to the connection that sent
// it, so this is how a test sees what its own queries announce.
export async function listeningDb(url: string): Promise<ListeningDb> {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    const heard: Heard[] = [];
    client.on("notification", (message) => heard.push({ channel: message.channel, payload: message.payload ?? "" }));
    for (const channel of Object.values(CHANNELS)) {
        await client.query(`LISTEN ${channel}`);
    }
    const pool = {
        connect: async () => Object.assign(client, { release: () => undefined }),
        end: async () => undefined,
    } as unknown as PostgresPool;
    const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    return {
        db,
        heard,
        stop: async () => {
            await db.destroy();
            await client.end();
        },
    };
}

// Lets a notification sent on commit arrive before the test looks
export async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 20));
}
