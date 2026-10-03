import { connect } from "@quard/db";
import { readConfig } from "./config/env.ts";
import { startControl } from "./server/start.ts";

const config = readConfig(process.env);

if (typeof config === "string") {
    console.error(config);
    process.exitCode = 1;
} else {
    const db = connect(config.databaseUrl);
    const { port, databaseUrl, redactor } = config;
    const control = await startControl({ db, databaseUrl, redactor, port });
    console.log(`control listening on port ${control.port}`);
    let stopping: Promise<void> | undefined;
    const stop = () => {
        stopping ??= control.close().then(() => db.destroy());
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
}
