// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SKILL } from "../components/install-skill/install-skill";
import { checkSkill, frontmatter } from "./skill";

const HEAD = "---\nname: demo\ndescription: Guards demo agents.\n---\n";

// A repo on disk with one skill: { "SKILL.md": "...", "references/a.md": "..." }
function repo(files: Record<string, string>, folder = "demo", repoFiles: string[] = []) {
    const root = mkdtempSync(path.join(tmpdir(), "docs-skill-"));
    const skill = path.join(root, "skills", folder);
    mkdirSync(skill, { recursive: true });
    for (const [name, text] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(skill, name)), { recursive: true });
        writeFileSync(path.join(skill, name), text);
    }
    for (const name of repoFiles) {
        mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
        writeFileSync(path.join(root, name), "");
    }
    return { root, skill };
}

describe("frontmatter", () => {
    it("reads plain, quoted and block values, and skips nested ones", () => {
        const text = [
            "---",
            "name: demo",
            'license: "See the repository"',
            "description: >",
            "    Guards demo agents.",
            "    Use it often.",
            "notes: |",
            "    one",
            "    two",
            "metadata:",
            "    author: someone",
            "---",
            "# Demo",
        ].join("\n");
        expect(frontmatter(text)).toEqual({
            name: "demo",
            license: "See the repository",
            description: "Guards demo agents. Use it often.",
            notes: "one\ntwo",
            metadata: "",
        });
    });

    it("reads a block value at the end of the frontmatter", () => {
        expect(frontmatter("---\ndescription: |\n    last\n---")).toEqual({ description: "last" });
    });

    it("finds none without a block at the top", () => {
        expect(frontmatter("# Demo\n---\nname: demo\n---\n")).toBeNull();
    });
});

describe("checkSkill", () => {
    it("accepts a skill with working links", () => {
        const { root, skill } = repo(
            {
                "SKILL.md": `${HEAD}See [guards](references/guards.md#top), [code](https://github.com/oynozan/quard/blob/main/packages/sdk/index.ts), [docs](https://github.com/oynozan/quard/tree/main/docs/content), [up](#demo) and [web](https://example.com).`,
                "references/guards.md": "Back to [the skill](../SKILL.md). `[not a link](nowhere.md)`",
                "assets/notes.txt": "[ignored](nowhere.md)",
            },
            "demo",
            ["packages/sdk/index.ts", "docs/content/index.mdx"],
        );
        expect(checkSkill(skill, root)).toEqual([]);
    });

    it("needs a SKILL.md", () => {
        const { root, skill } = repo({ "README.md": "# Demo" });
        expect(checkSkill(skill, root)).toEqual(["demo: no SKILL.md"]);
    });

    it("needs frontmatter", () => {
        const { root, skill } = repo({ "SKILL.md": "# Demo" });
        expect(checkSkill(skill, root)).toEqual(["SKILL.md: no frontmatter"]);
    });

    it("reports each broken field", () => {
        const long = "a".repeat(1025);
        const { root, skill } = repo({ "SKILL.md": `---\nname: other\ndescription: ${long}\n---\n` });
        expect(checkSkill(skill, root)).toEqual([
            "SKILL.md: name must be demo, the folder's name",
            "SKILL.md: description over 1024 characters",
        ]);
        const bad = repo({ "SKILL.md": "---\nname: Bad_Name\ndescription: Use <this>\n---\n" }, "Bad_Name");
        expect(checkSkill(bad.skill, bad.root)).toEqual([
            "SKILL.md: Bad_Name is not a valid skill name",
            "SKILL.md: angle brackets in the description",
        ]);
        const empty = repo({ "SKILL.md": "---\nname: demo\n---\n" });
        expect(checkSkill(empty.skill, empty.root)).toEqual(["SKILL.md: no description"]);
        const longName = "a".repeat(65);
        const tooLong = repo({ "SKILL.md": `---\nname: ${longName}\ndescription: Fine.\n---\n` }, longName);
        expect(checkSkill(tooLong.skill, tooLong.root)).toEqual([`SKILL.md: ${longName} is not a valid skill name`]);
    });

    it("reports each broken link", () => {
        const { root, skill } = repo({
            "SKILL.md": `${HEAD}[a](references/none.md) [b](../outside.md) [c](https://github.com/oynozan/quard/blob/main/gone.ts#L1)`,
        });
        expect(checkSkill(skill, root)).toEqual([
            "SKILL.md: missing file references/none.md",
            "SKILL.md: ../outside.md leaves the skill folder",
            "SKILL.md: missing repo file gone.ts",
        ]);
    });
});

describe("the Quard skill", () => {
    it("is the one the install command names, and is well formed", () => {
        const root = path.resolve(import.meta.dirname, "../..");
        expect(checkSkill(path.join(root, "skills", SKILL), root)).toEqual([]);
    });
});
