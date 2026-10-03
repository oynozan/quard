import type { Metadata } from "next";
import { Manrope, Ubuntu_Mono } from "next/font/google";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Layout, Navbar } from "nextra-theme-docs";
import { QuardWordmark } from "../components/logo/quard-mark";
import { BACKGROUND, SIGNAL } from "../theme/site";
import "nextra-theme-docs/style.css";
import "../styles/tokens.css";
import "../styles/chrome.css";
import "../styles/content.css";
import "../styles/code.css";
import "../styles/components.css";

const manrope = Manrope({
    variable: "--font-manrope",
    subsets: ["latin"],
});

const ubuntuMono = Ubuntu_Mono({
    variable: "--font-ubuntu-mono",
    weight: ["400", "700"],
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: { default: "Quard Docs", template: "%s · Quard Docs" },
    description: "How to set up and use Quard.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
    const pageMap = await getPageMap();
    return (
        <html lang="en" dir="ltr" suppressHydrationWarning className={`${manrope.variable} ${ubuntuMono.variable}`}>
            <Head color={SIGNAL} backgroundColor={BACKGROUND} />
            <body>
                <Layout
                    navbar={<Navbar logo={<QuardWordmark />} />}
                    pageMap={pageMap}
                    darkMode={false}
                    nextThemes={{ defaultTheme: "dark", forcedTheme: "dark" }}
                    // No public repo yet, so no edit or feedback links
                    editLink={null}
                    feedback={{ content: null }}
                    sidebar={{ defaultMenuCollapseLevel: 1 }}
                >
                    {children}
                </Layout>
            </body>
        </html>
    );
}
