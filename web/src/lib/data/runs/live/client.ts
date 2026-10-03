import "server-only";
import { connect, type Db } from "@quard/db";

let db: Db | undefined;

// One database pool per server process, opened on first use
export function database(): Db {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    db ??= connect(url);
    return db;
}
