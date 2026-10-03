// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkContent, findLinks, headingIds, mdxFiles, pageFile, slugify, stripCode } from "./links";

// A small docs tree on disk: { "guides/runs.mdx": "# Runs" }
function site(pages: Record<string, string>, images: string[] = []) {
    const root = mkdtempSync(path.join(tmpdir(), "docs-links-"));
    const content = path.join(root, "content");
    const pub = path.join(root, "public");
    for (const [name, text] of Object.entries({ ...pages, "notes.txt": "not a page" })) {
        mkdirSync(path.dirname(path.join(content, name)), { recursive: true });
        writeFileSync(path.join(content, name), text);
    }
    for (const image of images) {
        mkdirSync(path.dirname(path.join(pub, image)), { recursive: true });
        writeFileSync(path.join(pub, image), "");
    }
    return { content, pub };
}

describe("reading Markdown", () => {
    it("ignores code blocks and inline code", () => {
        expect(stripCode("a\n```md\n[x](/y)\n```\nb `[z](/w)` c")).toBe("a\n\nb  c");
    });

    it("finds links and images", () => {
        expect(findLinks("[Runs](/guides/runs) and ![Shot](/images/a.webp)")).toEqual([
            { href: "/guides/runs", image: false },
            { href: "/images/a.webp", image: true },
        ]);
    });

    it("builds heading ids like Nextra does", () => {
        expect(slugify("Read a run")).toBe("read-a-run");
        expect(slugify("What `guard()` does!")).toBe("what-guard-does");
        expect([...headingIds("# Runs\n## Find a **run**\n## Find a run\n```\n## Not a heading\n```")]).toEqual([
            "runs",
            "find-a-run",
            "find-a-run-1",
        ]);
    });
});

describe("finding pages", () => {
    const { content } = site({
        "index.mdx": "# Home",
        "guides/runs.mdx": "# Runs",
        "concepts/index.mdx": "# Concepts",
    });

    it("maps routes to content files", () => {
        expect(pageFile(content, "/")).toBe(path.join(content, "index.mdx"));
        expect(pageFile(content, "/guides/runs")).toBe(path.join(content, "guides/runs.mdx"));
        expect(pageFile(content, "/concepts/")).toBe(path.join(content, "concepts/index.mdx"));
        expect(pageFile(content, "/missing")).toBeNull();
    });

    it("lists every MDX file, in folders too", () => {
        expect(
            mdxFiles(content)
                .map((file) => path.relative(content, file))
                .sort(),
        ).toEqual(["concepts/index.mdx", "guides/runs.mdx", "index.mdx"]);
    });
});

describe("checkContent", () => {
    it("accepts working links, anchors, images and outside links", () => {
        const { content, pub } = site(
            {
                "index.mdx":
                    "# Home\n[Runs](/guides/runs#read-a-run) [Up](#home) [Web](https://example.com) [Mail](mailto:a@b.co)",
                "guides/runs.mdx": "# Runs\n## Read a run\n![Shot](/images/run.webp)",
            },
            ["images/run.webp"],
        );
        expect(checkContent(content, pub)).toEqual([]);
    });

    it("reports each kind of broken link", () => {
        const { content, pub } = site({
            "index.mdx": "# Home\n[A](/nowhere) [B](/#gone) [C](runs) ![D](/images/none.webp)",
        });
        expect(checkContent(content, pub)).toEqual([
            "index.mdx: missing page /nowhere",
            "index.mdx: missing heading /#gone",
            "index.mdx: write runs from the site root, such as /guides/runs",
            "index.mdx: missing image /images/none.webp",
        ]);
    });
});

describe("the docs", () => {
    it("have no broken links or images", () => {
        const docs = path.resolve(import.meta.dirname, "..");
        expect(checkContent(path.join(docs, "content"), path.join(docs, "public"))).toEqual([]);
    });
});
