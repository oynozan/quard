// @vitest-environment node
import { compileMdx } from "nextra/compile";
import { beforeAll, describe, expect, it } from "vitest";
import { codeTheme } from "./code-theme";
import { tokens } from "./tokens";

const source = [
    "```mermaid",
    "graph TD;",
    "  A --> B;",
    "```",
    "",
    "```ts",
    'const name: string = "quard";',
    "```",
].join("\n");

let output: string;

// The same Nextra pipeline the site uses for content pages, with the Quard theme.
// One compile serves both tests; it is slow while every package's tests run at once.
beforeAll(async () => {
    output = await compileMdx(source, {
        isPageImport: true,
        mdxOptions: {
            outputFormat: "program",
            rehypePrettyCodeOptions: { theme: { light: codeTheme, dark: codeTheme } },
        },
    });
}, 60_000);

describe("Markdown features", () => {
    it("turns mermaid blocks into the Mermaid component", () => {
        expect(output).toContain("@theguild/remark-mermaid/mermaid");
        expect(output).toContain("graph TD;\\\\n  A --> B;");
    });

    it("highlights code with the Quard theme", () => {
        const lower = output.toLowerCase();
        expect(lower).toContain(`"--shiki-dark": "${tokens.ink2}"`);
        expect(lower).toContain(`"--shiki-dark": "${tokens.mint}"`);
    });
});
