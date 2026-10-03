"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useState, type ReactNode, type RefObject } from "react";
import { Glyph } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";
import { PortalContainerProvider } from "./portal-container";

type DrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    // Repeats the label of the control that opened the drawer
    title: ReactNode;
    children: ReactNode;
    // Switching the view while open fades the new content in
    view?: string;
    initialFocus?: RefObject<HTMLElement | null>;
    className?: string;
};

// The one right-hand sheet for every secondary flow, wiping in from the right without sliding
export function Drawer({ open, onOpenChange, title, children, view = "main", initialFocus, className }: DrawerProps) {
    const [container, setContainer] = useState<HTMLDivElement | null>(null);
    const [seen, setSeen] = useState({ open, view, switched: false });
    if (seen.open !== open) setSeen({ open, view, switched: false });
    else if (seen.view !== view) setSeen({ open, view, switched: open });

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Backdrop className="drawer-scrim fixed inset-0 z-[60] bg-black/60" />
                <Dialog.Popup
                    ref={setContainer}
                    initialFocus={initialFocus}
                    className={cn(
                        "drawer-sheet fixed inset-y-0 right-0 z-[61] flex w-[420px] max-w-full flex-col border-l border-line-strong bg-panel text-ink outline-0",
                        className,
                    )}
                >
                    <PortalContainerProvider value={container}>
                        <header className="flex shrink-0 justify-end px-5 py-[14px]">
                            <Dialog.Close
                                aria-label="Close"
                                className={buttonVariants({ variant: "ghost", size: "icon" })}
                            >
                                <Glyph name="close" size={17} />
                            </Dialog.Close>
                        </header>
                        <div className="drawer-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 pt-4 pb-10 max-[480px]:px-5">
                            <div key={view} className={seen.switched ? "reveal" : undefined}>
                                <Dialog.Title className="text-[25px] leading-[1.3] font-[450] tracking-[-0.4px] text-ink">
                                    {title}
                                </Dialog.Title>
                                {children}
                            </div>
                        </div>
                    </PortalContainerProvider>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
