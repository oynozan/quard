import { main } from "./main.ts";

// pnpm --filter docs screenshots --url http://localhost:3100 --only shell,run
const problems = await main(process.argv.slice(2));
process.exitCode = problems ? 1 : 0;
