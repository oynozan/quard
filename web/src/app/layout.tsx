import type { Metadata } from "next";
import { Manrope, Ubuntu_Mono } from "next/font/google";
import "./globals.css";

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
    title: { default: "Quard", template: "%s · Quard" },
    description: "Quard watches AI agents while they work, stops dangerous actions and shows what caused a failure.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
    return (
        <html lang="en" className={`${manrope.variable} ${ubuntuMono.variable} h-full antialiased`}>
            <body className="min-h-full">{children}</body>
        </html>
    );
}
