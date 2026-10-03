import path from "node:path";
import type { NextConfig } from "next";
import nextra from "nextra";
import { codeTheme } from "./theme/code-theme";

// Nextra's Mermaid blocks render through our component, so diagrams use the Quard colors
const MERMAID = "@theguild/remark-mermaid/mermaid";
const OWN_MERMAID = "./components/mermaid/mermaid.tsx";

const withNextra = nextra({
    defaultShowCopyCode: true,
    search: { codeblocks: false },
    mdxOptions: {
        // The site is dark only, so both slots get the same theme
        rehypePrettyCodeOptions: { theme: { light: codeTheme, dark: codeTheme } },
    },
});

const nextConfig: NextConfig = {
    reactStrictMode: true,
    devIndicators: false,
    turbopack: {
        resolveAlias: { [MERMAID]: OWN_MERMAID },
    },
    webpack(config) {
        config.resolve.alias[`${MERMAID}$`] = path.join(process.cwd(), OWN_MERMAID);
        return config;
    },
};

export default withNextra(nextConfig);
