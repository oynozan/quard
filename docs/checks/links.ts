import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type Link = { href: string; image: boolean };

// Removes fenced code blocks, which hold no real links or headings
function stripFences(markdown: string) {
    return markdown.replace(/^```[\s\S]*?^```/gm, "");
}

// Removes code blocks and inline code, so their text is never read as a link
export function stripCode(markdown: string) {
    return stripFences(markdown).replace(/`[^`\n]*`/g, "");
}

// Links and images written in Markdown syntax
export function findLinks(markdown: string): Link[] {
    return [...stripCode(markdown).matchAll(/(!?)\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => ({
        image: m[1] === "!",
        href: m[2] as string,
    }));
}

// The id Nextra gives a heading, with the same rules as github-slugger
export function slugify(text: string) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
        .replace(/ /g, "-");
}

// Every heading id on a page; repeated headings get -1, -2 and so on.
// Code in a heading is part of its id, so only fenced blocks are skipped.
export function headingIds(markdown: string) {
    const ids = new Set<string>();
    const seen = new Map<string, number>();
    for (const m of stripFences(markdown).matchAll(/^#{1,6} +(.+)$/gm)) {
        const base = slugify((m[1] as string).replace(/[*_`]/g, ""));
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        ids.add(count ? `${base}-${count}` : base);
    }
    return ids;
}

// The content file behind a route such as /guides/runs, or null
export function pageFile(contentDir: string, route: string) {
    const base = route === "/" ? "index" : route.replace(/^\/|\/$/g, "");
    const files = [`${base}.mdx`, `${base}/index.mdx`].map((name) => path.join(contentDir, name));
    return files.find((file) => existsSync(file)) ?? null;
}

export function mdxFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return mdxFiles(full);
        return entry.name.endsWith(".mdx") ? [full] : [];
    });
}

// Problems with one link, read from the page it appears on
function checkLink(link: Link, file: string, contentDir: string, publicDir: string): string | null {
    const { href, image } = link;
    if (/^(https?:|mailto:)/.test(href)) return null;
    if (image) return existsSync(path.join(publicDir, href)) ? null : `missing image ${href}`;
    if (!href.startsWith("/") && !href.startsWith("#")) return `write ${href} from the site root, such as /guides/runs`;
    const [route, anchor] = href.split("#") as [string, string | undefined];
    const target = route ? pageFile(contentDir, route) : file;
    if (!target) return `missing page ${route}`;
    if (anchor && !headingIds(readFileSync(target, "utf8")).has(anchor)) return `missing heading ${href}`;
    return null;
}

// Every broken link or image across the docs, as "file: problem"
export function checkContent(contentDir: string, publicDir: string) {
    return mdxFiles(contentDir).flatMap((file) =>
        findLinks(readFileSync(file, "utf8"))
            .map((link) => checkLink(link, file, contentDir, publicDir))
            .filter((problem): problem is string => problem !== null)
            .map((problem) => `${path.relative(contentDir, file)}: ${problem}`),
    );
}
