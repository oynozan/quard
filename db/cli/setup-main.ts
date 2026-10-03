import { setupFromArgs } from "./setup.ts";

process.exitCode = await setupFromArgs(process.argv.slice(2), process.env);
