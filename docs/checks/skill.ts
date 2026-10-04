import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { findLinks } from "./links";

// Links into this repository, read as paths from its root
const REPO_LINK = /^https:\/\/github\.com\/oynozan\/quard\/(?:blob|tree)\/main\/([^#?]+)/;

// The Agent Skills rule for a name: lowercase words joined by hyphens
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// One value with its quotes taken off
function unquote(value: string) {
    return /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
}

// The top-level fields of a frontmatter block, or null when there is none.
// A block value (> or |) joins its indented lines.
export function frontmatter(markdown: string): Record<string, string> | null {
    const block = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(markdown);
    if (!block) return null;
    const fields: Record<string, string> = {};
    const lines = (block[1] as string).split("\n");
    lines.forEach((line, index) => {
        const field = /^([a-z][\w-]*):[ \t]*(.*)$/.exec(line);
        if (!field) return;
        const [, key, value] = field as unknown as [string, string, string];
        if (value !== ">" && value !== "|") {
            fields[key] = unquote(value.trim());
            return;
        }
        const rest = lines.slice(index + 1);
        const end = rest.findIndex((next) => !/^\s/.test(next));
        const body = (end === -1 ? rest : rest.slice(0, end)).map((next) => next.trim());
        fields[key] = body.join(value === ">" ? " " : "\n");
    });
    return fields;
}

function markdownFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return markdownFiles(full);
        return entry.name.endsWith(".md") ? [full] : [];
    });
}

// Problems with one link in a skill file, or null
function checkLink(href: string, file: string, skillDir: string, repoRoot: string): string | null {
    const repo = REPO_LINK.exec(href);
    if (repo) return existsSync(path.join(repoRoot, repo[1] as string)) ? null : `missing repo file ${repo[1]}`;
    if (/^(https?:|mailto:|#)/.test(href)) return null;
    const target = path.resolve(path.dirname(file), href.split("#")[0] as string);
    if (!target.startsWith(skillDir + path.sep)) return `${href} leaves the skill folder`;
    return existsSync(target) ? null : `missing file ${href}`;
}

// Problems with the frontmatter of a skill named after its folder
function checkFields(fields: Record<string, string> | null, name: string): string[] {
    if (!fields) return ["SKILL.md: no frontmatter"];
    const description = fields.description ?? "";
    return [
        fields.name !== name && `name must be ${name}, the folder's name`,
        (!NAME.test(name) || name.length > 64) && `${name} is not a valid skill name`,
        !description && "no description",
        description.length > 1024 && "description over 1024 characters",
        /[<>]/.test(description) && "angle brackets in the description",
    ]
        .filter((problem): problem is string => typeof problem === "string")
        .map((problem) => `SKILL.md: ${problem}`);
}

// Every problem with the skill in skillDir, as "file: problem"
export function checkSkill(skillDir: string, repoRoot: string): string[] {
    const name = path.basename(skillDir);
    const main = path.join(skillDir, "SKILL.md");
    if (!existsSync(main)) return [`${name}: no SKILL.md`];
    const links = markdownFiles(skillDir).flatMap((file) =>
        findLinks(readFileSync(file, "utf8"))
            .map(({ href }) => checkLink(href, file, skillDir, repoRoot))
            .filter((problem): problem is string => problem !== null)
            .map((problem) => `${path.relative(skillDir, file)}: ${problem}`),
    );
    return [...checkFields(frontmatter(readFileSync(main, "utf8")), name), ...links];
}
