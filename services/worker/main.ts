import { connect } from "@quard/db";
import { readConfig } from "./config/env.ts";
import { startWorker } from "./runner/worker.ts";

const config = readConfig(process.env);

if (typeof config === "string") {
    console.error(config);
    process.exitCode = 1;
} else {
    const db = connect(config.databaseUrl);
    const worker = startWorker({ db, openai: config.openai });
    let stopping: Promise<void> | undefined;
    const stop = () => {
        stopping ??= worker.stop().then(() => db.destroy());
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
}
