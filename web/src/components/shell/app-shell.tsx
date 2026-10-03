"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Glyph } from "@/components/icons/glyphs";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "./sidebar";
import { pageTitle } from "./nav-config";

type AppShellProps = {
    children: ReactNode;
    openApprovals: number;
    account: { email: string; role: string };
};

// A fixed left rail and a full-bleed content column. Below 760px the rail becomes an overlay.
export function AppShell({ children, ...sidebar }: AppShellProps) {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open]);

    return (
        <div className="min-h-dvh">
            <a
                href="#content"
                className="fixed top-[-70px] left-4 z-[100] rounded-md bg-signal px-4 py-[10px] text-[14px] text-on-signal focus:top-3"
            >
                Skip to content
            </a>

            {open ? (
                <button
                    type="button"
                    aria-label="Close navigation"
                    onClick={() => setOpen(false)}
                    className="reveal fixed inset-0 z-[29] bg-black/60 min-[761px]:hidden"
                />
            ) : null}

            <aside
                aria-label="Main navigation"
                className={cn(
                    "fixed inset-y-0 left-0 z-30 flex w-[244px] flex-col overflow-y-auto border-r border-line bg-rail max-[1250px]:w-[210px]",
                    "max-[760px]:w-[244px]",
                    open ? "max-[760px]:flex" : "max-[760px]:hidden",
                )}
            >
                <Sidebar {...sidebar} onNavigate={() => setOpen(false)} />
            </aside>

            <div className="flex min-h-dvh flex-col pl-[244px] max-[1250px]:pl-[210px] max-[760px]:pl-0">
                <header className="hidden h-[59px] items-center gap-[10px] border-b border-line px-[14px] text-[14px] max-[760px]:flex">
                    <button
                        type="button"
                        aria-label={open ? "Close navigation" : "Open navigation"}
                        aria-expanded={open}
                        onClick={() => setOpen(!open)}
                        className="inline-grid size-8 min-h-[34px] place-items-center rounded-md text-ink-2 hover:bg-control-hover hover:text-ink-bright"
                    >
                        {open ? <Glyph name="close" size={17} /> : <Menu size={17} strokeWidth={0.75} />}
                    </button>
                    <span>{pageTitle(pathname)}</span>
                </header>
                <main id="content" tabIndex={-1} className="min-w-0 flex-1 outline-0">
                    {children}
                </main>
            </div>
            <Toaster />
        </div>
    );
}
