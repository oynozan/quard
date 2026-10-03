import path from "node:path";
import type { Page } from "./page.ts";
import type { Job, Rect } from "./types.ts";

export type ShootOptions = {
    base: string;
    outDir: string;
    sleep: (ms: number) => Promise<void>;
    write: (file: string, data: Buffer) => Promise<void>;
};

const WIDTH = 1440;

const describe = (target: { text?: string; sel?: string }) => target.text ?? target.sel;

// Takes one marked screenshot and returns any problems with it.
// A shot with problems is not saved, so a broken page never replaces a good picture.
export async function shoot(page: Page, job: Job, options: ShootOptions) {
    const problems: string[] = [];
    await page.resize(WIDTH, job.height ?? 900);
    await page.open(options.base + job.url);
    await options.sleep(3500);
    await page.install();
    for (const action of job.actions ?? []) {
        const clicked = await page.evaluate<boolean>(`window.__shots.click(${JSON.stringify(action.click)})`);
        if (!clicked) problems.push(`nothing to click: ${describe(action.click)}`);
        await options.sleep(action.wait ?? 800);
    }
    if (job.full) {
        const height = await page.evaluate<number>("Math.ceil(document.documentElement.scrollHeight)");
        await page.resize(WIDTH, height);
        await options.sleep(1500);
    }
    const missing = await page.evaluate<string[]>(`window.__shots.mark(${JSON.stringify(job.marks)})`);
    problems.push(...missing.map((mark) => `mark not found: ${mark}`));
    let clip: Rect | undefined;
    if (job.clip) {
        const r = await page.evaluate<Rect | null>(`window.__shots.rect(${JSON.stringify(job.clip)})`);
        const pad = job.clip.pad ?? 24;
        if (r) {
            const x = Math.max(0, r.x - pad);
            const y = Math.max(0, r.y - pad);
            clip = { x, y, w: Math.min(WIDTH - x, r.w + pad * 2), h: r.h + pad * 2 };
        } else problems.push(`nothing to crop to: ${describe(job.clip)}`);
    }
    if (problems.length) return problems;
    await options.write(path.join(options.outDir, `${job.name}.webp`), await page.capture(clip));
    return problems;
}
