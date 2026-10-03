import { migrateFromEnv } from "./migrate/cli.ts";

process.exitCode = await migrateFromEnv(process.env);
