import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QuardWordmark } from "../components/logo/quard-mark";
import { BACKGROUND, SIGNAL } from "../theme/site";
import RootLayout, { metadata } from "./layout";

vi.mock("next/font/google", () => ({
    Manrope: () => ({ variable: "font-manrope" }),
    Ubuntu_Mono: () => ({ variable: "font-ubuntu-mono" }),
}));
vi.mock("nextra/page-map", () => ({ getPageMap: async () => [{ name: "index", route: "/" }] }));
vi.mock("nextra/components", () => ({ Head: () => null }));
vi.mock("nextra-theme-docs", () => ({ Layout: () => null, Navbar: () => null }));

type Element = ReactElement<{ children?: ReactNode; [key: string]: unknown }>;

async function renderLayout() {
    const html = (await RootLayout({ children: <p>page</p> } as LayoutProps<"/">)) as Element;
    const [head, body] = html.props.children as Element[];
    const layout = (body as Element).props.children as Element;
    return { html, head: head as Element, layout };
}

describe("RootLayout", () => {
    it("sets the language, direction and both fonts", async () => {
        const { html } = await renderLayout();
        expect(html.props.lang).toBe("en");
        expect(html.props.dir).toBe("ltr");
        expect(html.props.className).toBe("font-manrope font-ubuntu-mono");
    });

    it("gives Nextra the Quard colors", async () => {
        const { head } = await renderLayout();
        expect(head.props.color).toBe(SIGNAL);
        expect(head.props.backgroundColor).toBe(BACKGROUND);
    });

    it("keeps the site dark only, with no theme switch", async () => {
        const { layout } = await renderLayout();
        expect(layout.props.darkMode).toBe(false);
        expect(layout.props.nextThemes).toEqual({ defaultTheme: "dark", forcedTheme: "dark" });
    });

    it("hides the links that would point at Nextra's repo", async () => {
        const { layout } = await renderLayout();
        expect(layout.props.editLink).toBeNull();
        expect(layout.props.feedback).toEqual({ content: null });
    });

    it("passes the page map, the Quard logo and the page", async () => {
        const { layout } = await renderLayout();
        expect(layout.props.pageMap).toEqual([{ name: "index", route: "/" }]);
        const navbar = layout.props.navbar as Element;
        expect((navbar.props.logo as Element).type).toBe(QuardWordmark);
        expect(layout.props.children).toEqual(<p>page</p>);
    });

    it("titles pages after the docs", () => {
        expect(metadata.title).toEqual({ default: "Quard Docs", template: "%s · Quard Docs" });
    });
});
