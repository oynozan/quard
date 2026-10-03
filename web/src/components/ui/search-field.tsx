"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
    // Pressing "/" focuses the field, so keep it on one field per page
    shortcut?: boolean;
    boxClassName?: string;
};

// True when a key press belongs to a field, an open menu or a dialog
function keyIsTaken(): boolean {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
        if (active.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return true;
        if (active.closest('[role="listbox"], [role="menu"]')) return true;
    }
    return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

// The 32px recess search box with its "/" hint
export function SearchField({
    shortcut = true,
    className,
    boxClassName,
    "aria-label": ariaLabel = "Search",
    ...props
}: SearchFieldProps) {
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!shortcut) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
            if (keyIsTaken()) return;
            event.preventDefault();
            ref.current?.focus();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [shortcut]);

    return (
        <label
            data-slot="search-field"
            className={cn(
                "flex h-8 max-w-[360px] min-w-0 flex-1 cursor-text items-center gap-2 rounded-md border border-transparent bg-control px-[9px] focus-within:border-signal max-[760px]:h-[34px] max-[760px]:max-w-none",
                boxClassName,
            )}
        >
            <Search aria-hidden size={17} strokeWidth={0.75} className="shrink-0 opacity-45" />
            <input
                ref={ref}
                type="search"
                aria-label={ariaLabel}
                title={shortcut ? `${ariaLabel} (/)` : undefined}
                className={cn(
                    "h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none",
                    className,
                )}
                {...props}
            />
            {shortcut ? (
                <kbd
                    aria-hidden
                    className="mono shrink-0 rounded-sm bg-tile px-1 text-[10px] leading-[14px] text-ink-absent max-[760px]:hidden"
                >
                    /
                </kbd>
            ) : null}
        </label>
    );
}
