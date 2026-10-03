// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// next/font only works inside the Next build, so each font hands back its CSS variable name
vi.mock("next/font/google", () => ({
    Manrope: () => ({ variable: "font-manrope" }),
    Ubuntu_Mono: () => ({ variable: "font-ubuntu-mono" }),
}));

const { default: RootLayout, metadata } = await import("./layout");

describe("RootLayout", () => {
    it("wraps every page in an English document with both font variables", () => {
        const html = renderToStaticMarkup(
            RootLayout({ children: <p>Page body</p>, params: Promise.resolve({}) } as LayoutProps<"/">),
        );
        expect(html).toContain('<html lang="en" class="font-manrope font-ubuntu-mono h-full antialiased">');
        expect(html).toContain('<body class="min-h-full"><p>Page body</p></body>');
    });

    it("names each page after Quard", () => {
        expect(metadata.title).toEqual({ default: "Quard", template: "%s · Quard" });
        expect(metadata.description).toContain("stops dangerous actions");
    });
});
