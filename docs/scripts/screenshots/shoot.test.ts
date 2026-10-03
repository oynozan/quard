// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Page } from "./page";
import { shoot } from "./shoot";
import type { Job } from "./types";

// A page whose evaluate answers are chosen per expression
function fakePage(answers: { click?: boolean; height?: number; missing?: string[]; rect?: unknown }) {
    const evaluate = vi.fn(async (expression: string) => {
        if (expression.startsWith("window.__shots.click")) return answers.click ?? true;
        if (expression.startsWith("Math.ceil")) return answers.height ?? 2000;
        if (expression.startsWith("window.__shots.mark")) return answers.missing ?? [];
        return answers.rect ?? null;
    });
    const page = {
        evaluate,
        resize: vi.fn(async () => ({})),
        open: vi.fn(async () => {}),
        install: vi.fn(async () => {}),
        capture: vi.fn(async () => Buffer.from("img")),
    };
    return page as typeof page & Page;
}

const options = () => ({
    base: "http://dash",
    outDir: "out",
    sleep: vi.fn(async () => {}),
    write: vi.fn(async () => {}),
});

describe("shoot", () => {
    it("opens the page, draws the marks and saves the picture", async () => {
        const page = fakePage({});
        const opts = options();
        const job: Job = { name: "runs", url: "/runs", marks: [{ n: 1, sel: "h1" }] };
        expect(await shoot(page, job, opts)).toEqual([]);
        expect(page.resize).toHaveBeenCalledWith(1440, 900);
        expect(page.open).toHaveBeenCalledWith("http://dash/runs");
        expect(page.install).toHaveBeenCalled();
        expect(page.evaluate).toHaveBeenCalledWith('window.__shots.mark([{"n":1,"sel":"h1"}])');
        expect(page.capture).toHaveBeenCalledWith(undefined);
        expect(opts.write).toHaveBeenCalledWith("out/runs.webp", Buffer.from("img"));
    });

    it("clicks first, grows to the full page and crops to the clip", async () => {
        const page = fakePage({ height: 2400, rect: { x: 10, y: 30, w: 1430, h: 100 } });
        const job: Job = {
            name: "deny",
            url: "/approvals",
            height: 1000,
            full: true,
            actions: [{ click: { text: "Deny" } }, { click: { sel: "button" }, wait: 50 }],
            marks: [],
            clip: { sel: "article" },
        };
        const opts = options();
        await shoot(page, job, opts);
        expect(page.resize).toHaveBeenNthCalledWith(1, 1440, 1000);
        expect(page.resize).toHaveBeenNthCalledWith(2, 1440, 2400);
        expect(opts.sleep).toHaveBeenCalledWith(800);
        expect(opts.sleep).toHaveBeenCalledWith(50);
        expect(page.capture).toHaveBeenCalledWith({ x: 0, y: 6, w: 1440, h: 148 });
    });

    it("uses the clip's own padding", async () => {
        const page = fakePage({ rect: { x: 100, y: 100, w: 200, h: 50 } });
        await shoot(page, { name: "a", url: "/", marks: [], clip: { sel: "form", pad: 10 } }, options());
        expect(page.capture).toHaveBeenCalledWith({ x: 90, y: 90, w: 220, h: 70 });
    });

    it("reports what it could not find, and keeps the old picture", async () => {
        const page = fakePage({ click: false, missing: ["2 table"] });
        const opts = options();
        const job: Job = {
            name: "broken",
            url: "/",
            actions: [{ click: { sel: "button" } }],
            marks: [{ n: 2, sel: "table" }],
            clip: { text: "Nowhere" },
        };
        expect(await shoot(page, job, opts)).toEqual([
            "nothing to click: button",
            "mark not found: 2 table",
            "nothing to crop to: Nowhere",
        ]);
        expect(page.capture).not.toHaveBeenCalled();
        expect(opts.write).not.toHaveBeenCalled();
    });
});
