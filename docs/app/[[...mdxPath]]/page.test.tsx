import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import Page, { generateMetadata, generateStaticParams } from "./page";

const MDXContent = () => null;
const page = vi.hoisted(() => ({ toc: [{ id: "intro" }], metadata: { title: "Intro" }, sourceCode: "# Intro" }));
const importPage = vi.hoisted(() => vi.fn());

vi.mock("nextra/pages", () => ({
    generateStaticParamsFor: (segment: string) => () => [{ [segment]: ["intro"] }],
    importPage,
}));
vi.mock("nextra-theme-docs", () => ({ useMDXComponents: () => ({ wrapper: () => null }) }));

const props = { params: Promise.resolve({ mdxPath: ["intro"] }) } as PageProps<"/[[...mdxPath]]">;

describe("catch-all page", () => {
    it("lists every content page for static export", () => {
        expect(generateStaticParams()).toEqual([{ mdxPath: ["intro"] }]);
    });

    it("takes its metadata from the MDX file", async () => {
        importPage.mockResolvedValue({ default: MDXContent, ...page });
        expect(await generateMetadata(props)).toEqual({ title: "Intro" });
        expect(importPage).toHaveBeenCalledWith(["intro"]);
    });

    it("wraps the MDX content with its table of contents", async () => {
        importPage.mockResolvedValue({ default: MDXContent, ...page });
        const element = (await Page(props)) as ReactElement<Record<string, unknown>>;
        expect(element.props.toc).toBe(page.toc);
        expect(element.props.metadata).toBe(page.metadata);
        expect(element.props.sourceCode).toBe(page.sourceCode);
        const content = element.props.children as ReactElement<{ params: unknown }>;
        expect(content.type).toBe(MDXContent);
        expect(content.props.params).toEqual({ mdxPath: ["intro"] });
    });
});
