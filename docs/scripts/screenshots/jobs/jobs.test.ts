// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findLinks, mdxFiles } from "../../../checks/links";
import { JOBS } from "./index";

const DOCS = path.resolve(import.meta.dirname, "../../..");

// Every guide image the docs pages use
function guideImages() {
    return mdxFiles(path.join(DOCS, "content"))
        .flatMap((file) => findLinks(readFileSync(file, "utf8")))
        .filter((link) => link.image && link.href.startsWith("/images/guides/"))
        .map((link) => path.basename(link.href, ".webp"));
}

// Numbered items of the list these lines start with, nested lines skipped
function countCallouts(lines: string[]) {
    let count = 0;
    for (const line of lines) {
        if (/^\d+\. /.test(line)) count++;
        else if (line.trim() !== "" && !/^\s/.test(line)) break;
    }
    return count;
}

// How many numbered callouts sit under each guide image, by image name
function calloutsByImage() {
    const counts = new Map<string, number>();
    for (const file of mdxFiles(path.join(DOCS, "content"))) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, index) => {
            const image = /^!\[[^\]]*\]\(\/images\/guides\/([\w-]+)\.webp\)/.exec(line);
            if (image) counts.set(image[1] as string, countCallouts(lines.slice(index + 1)));
        });
    }
    return counts;
}

describe("screenshot jobs", () => {
    it("have unique names and dashboard paths", () => {
        const names = JOBS.map((job) => job.name);
        expect(new Set(names).size).toBe(names.length);
        for (const job of JOBS) expect(job.url.startsWith("/")).toBe(true);
    });

    it("number their marks 1, 2, 3 and so on", () => {
        for (const job of JOBS) expect(job.marks.map((mark) => mark.n)).toEqual(job.marks.map((_, i) => i + 1));
    });

    it("cover exactly the screenshots the docs use", () => {
        expect(JOBS.map((job) => job.name).sort()).toEqual([...new Set(guideImages())].sort());
    });

    it("have one mark for each numbered callout under their image", () => {
        const callouts = calloutsByImage();
        for (const job of JOBS) expect([job.name, job.marks.length]).toEqual([job.name, callouts.get(job.name)]);
    });
});
