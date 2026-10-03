// Starts the local Quard backend and the dashboard with one command:
// it applies migrations and runs webhook, control and the web app.
//
// DATABASE_URL comes from web/.env and QUARD_HASH_KEY from sandbox/.env.
// Create your agent key in the dashboard. Ctrl-C stops it all.
//
// Run: node sandbox/dashboard.ts

import type { ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { migrateDatabase } from "@quard/db/migrate";
import { portInUse, SERVICES, start, waitUntilUp } from "./lib/backend/services.ts";

// Only the named values are read, so the OpenAI key stays out of the services
function fromFile(path: string): Record<string, string | undefined> {
    try {
        return parseEnv(readFileSync(new URL(path, import.meta.url), "utf8"));
    } catch {
        return {};
    }
}

const sandbox = fromFile(".env");
const databaseUrl = process.env.DATABASE_URL ?? fromFile("../web/.env").DATABASE_URL;
const hashKey = process.env.QUARD_HASH_KEY ?? sandbox.QUARD_HASH_KEY;
const agentKey = process.env.QUARD_AGENT_KEY ?? sandbox.QUARD_AGENT_KEY;

if (!databaseUrl) {
    console.error("Set DATABASE_URL in web/.env. No Postgres? Run: pnpm --filter @quard/db dev:db");
    process.exit(1);
}
if (!hashKey) {
    console.error("Add QUARD_HASH_KEY to sandbox/.env: 64 hex characters. Make one with: openssl rand -hex 32");
    process.exit(1);
}

for (const service of SERVICES) {
    if (await portInUse(service.port)) {
        console.error(`Port ${service.port} (${service.name}) is in use. Stop what runs there, then try again.`);
        process.exit(1);
    }
}

await migrateDatabase(databaseUrl).catch((error: Error) => {
    console.error(`Can't reach the database in web/.env: ${error.message}`);
    console.error("No Postgres? Run: pnpm --filter @quard/db dev:db");
    process.exit(1);
});

// Search in the dashboard needs the same hash key as the SDK
const env = { ...process.env, DATABASE_URL: databaseUrl, QUARD_HASH_KEY: hashKey };
const children: ChildProcess[] = [];

function stopAll(code: number): void {
    for (const child of children) {
        child.kill("SIGTERM");
    }
    process.exitCode = code;
}
process.once("SIGINT", () => stopAll(0));
process.once("SIGTERM", () => stopAll(0));

for (const service of SERVICES) {
    const child = start(service, env);
    children.push(child);
    if (!(await waitUntilUp(service, child))) {
        console.error(`${service.name} didn't start. Its output is above.`);
        stopAll(1);
        break;
    }
}

if (process.exitCode === undefined) {
    console.log("");
    console.log("  Dashboard: http://localhost:3000  (sign in with email or GitHub)");
    if (!agentKey) {
        console.log("  Then: Settings → Create key, and add it to sandbox/.env as QUARD_AGENT_KEY.");
    }
    console.log("  In another terminal: node sandbox/15-everything.ts");
    console.log("  Ctrl-C stops the backend.");
    console.log("");
}
