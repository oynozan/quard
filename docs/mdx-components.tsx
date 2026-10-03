import { useMDXComponents as getThemeComponents } from "nextra-theme-docs";
import type { MDXComponents } from "nextra/mdx-components";

const themeComponents = getThemeComponents();

// Nextra renders every MDX page with these components
export function useMDXComponents(components?: MDXComponents) {
    return { ...themeComponents, ...components };
}
