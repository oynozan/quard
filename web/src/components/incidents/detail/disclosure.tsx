"use client";

import { useId, useState, type ReactNode } from "react";
import { Glyph } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";

// A muted toggle that opens its content in place.
export function Disclosure({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
    const [open, setOpen] = useState(false);
    const id = useId();
    return (
        <div className={className}>
            <button
                type="button"
                aria-expanded={open}
                aria-controls={id}
                onClick={() => setOpen((value) => !value)}
                className="group/more inline-flex w-fit cursor-pointer items-center gap-[3px] rounded-[2px] text-[12px] text-ink-link transition-colors hover:text-ink-bright"
            >
                {label}
                <Glyph
                    name="chevronDown"
                    size={14}
                    aria-hidden
                    className={cn(
                        "opacity-60 transition-[opacity,transform] group-hover/more:opacity-100",
                        open && "rotate-180",
                    )}
                />
            </button>
            <div id={id} hidden={!open} className="mt-2">
                {children}
            </div>
        </div>
    );
}
