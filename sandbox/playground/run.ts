// The playground's runner: node sandbox/playground/run.ts [folder]
// It runs scenario.json once, with the rules in policy.json. The files
// are next to this file unless a folder is given.
import { resolve } from "node:path";
import { runPlayground } from "./run-scenario.ts";

process.exitCode = await runPlayground(resolve(process.argv[2] ?? import.meta.dirname));
