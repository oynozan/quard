import { fileURLToPath } from "node:url";
import { startDevServer } from "./server.ts";

// Data stays in db/.pglite between runs
const server = await startDevServer({
    dataDir: fileURLToPath(new URL("../.pglite", import.meta.url)),
    port: Number(process.env.PORT ?? 5432),
});

console.log(`Dev Postgres (PGlite): DATABASE_URL=${server.url}`);
process.once("SIGINT", () => void server.stop().then(() => process.exit(0)));
