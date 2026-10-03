import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Glyph } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";

type LinkProps = ComponentProps<typeof Link>;

// An inline link. It is always underlined, so it reads as clickable before hover.
export function TextLink({ className, mono, ...props }: LinkProps & { mono?: boolean }) {
    return (
        <Link
            className={cn(
                "rounded-[2px] text-ink-link underline decoration-line-hover underline-offset-[3px] transition-colors hover:text-ink-bright hover:decoration-ink-2",
                mono && "mono",
                className,
            )}
            {...props}
        />
    );
}

// A link that goes to another view: words plus a chevron, like "View all".
export function ArrowLink({ className, children, ...props }: LinkProps & { children: ReactNode }) {
    return (
        <Link
            className={cn(
                "group/arrow inline-flex items-center gap-[3px] rounded-[2px] text-[13px] whitespace-nowrap text-ink-link transition-colors hover:text-ink-bright",
                className,
            )}
            {...props}
        >
            {children}
            <Glyph
                name="chevronRight"
                size={14}
                aria-hidden
                className="opacity-60 transition-opacity group-hover/arrow:opacity-100"
            />
        </Link>
    );
}

// The main link of a clickable row or card. Its hit area covers the whole row (Tr interactive).
export function RowLink({ className, ...props }: LinkProps) {
    return (
        <Link
            className={cn(
                "block min-w-0 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-signal",
                className,
            )}
            {...props}
        />
    );
}

// The chevron at the end of a clickable row. It brightens while the row is hovered.
export function RowChevron({ className }: { className?: string }) {
    return (
        <Glyph
            name="chevronRight"
            size={16}
            aria-hidden
            className={cn(
                "ml-2 inline-block shrink-0 align-[-3px] text-ink-faint transition-colors group-hover/row:text-ink-bright",
                className,
            )}
        />
    );
}
