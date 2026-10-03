import { serve } from "@hono/node-server";
import { connect } from "@quard/db";
import { createApp } from "./app.ts";
import { readConfig } from "./config/env.ts";

const config = readConfig(process.env);

if (typeof config === "string") {
    console.error(config);
    process.exitCode = 1;
} else {
    const app = createApp({ db: connect(config.databaseUrl), redactor: config.redactor });
    serve({ fetch: app.fetch, port: config.port }, (info) => {
        console.log(`webhook listening on port ${info.port}`);
    });
}
