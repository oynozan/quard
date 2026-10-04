import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { connect } from "./cdp.ts";
import { CHROME_PATH, launchChrome, sleep } from "./chrome.ts";
import { JOBS } from "./jobs/index.ts";
import { browserPage } from "./page.ts";
import { shoot } from "./shoot.ts";

export const OUT_DIR = "public/images/guides";

// Retakes the guide screenshots from a running dashboard and returns how many problems it found
export async function main(argv: string[]) {
    const { values } = parseArgs({
        args: argv,
        options: {
            url: { type: "string", default: "http://localhost:3100" },
            only: { type: "string" },
            chrome: { type: "string", default: process.env.CHROME_PATH ?? CHROME_PATH },
        },
    });
    const names = values.only?.split(",");
    const unknown = names?.filter((name) => !JOBS.some((job) => job.name === name)) ?? [];
    if (unknown.length) throw new Error(`Unknown screenshot: ${unknown.join(", ")}`);
    const jobs = names ? JOBS.filter((job) => names.includes(job.name)) : JOBS;
    await mkdir(OUT_DIR, { recursive: true });
    const chrome = await launchChrome(values.chrome, 9334);
    try {
        const cdp = await connect(chrome.wsUrl);
        const page = browserPage(cdp);
        let problems = 0;
        for (const job of jobs) {
            const found = await shoot(page, job, { base: values.url, outDir: OUT_DIR, sleep, write: writeFile });
            problems += found.length;
            console.log(found.length ? `${job.name}: ${found.join("; ")}` : job.name);
        }
        cdp.close();
        return problems;
    } finally {
        chrome.kill();
    }
}
