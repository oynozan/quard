import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Glyph } from "@/components/icons/glyphs";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

// One 32px row above a table with search first, compact selects next and refresh pushed right
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div
            className={cn(
                "mb-[14px] flex flex-wrap items-center gap-2 max-[760px]:*:data-[slot=search-field]:basis-full",
                className,
            )}
        >
            {children}
        </div>
    );
}

// Pushes everything after it to the right edge of the toolbar
export function ToolbarSpacer() {
    return <span aria-hidden className="ml-auto" />;
}

type RefreshButtonProps = Omit<ComponentProps<typeof Button>, "children" | "variant" | "size">;

// The outlined 32px refresh button, which shows the spinner and stays disabled while busy
export function RefreshButton({ busy = false, className, disabled, ...props }: RefreshButtonProps) {
    return (
        <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh"
            title="Refresh"
            disabled={disabled || busy}
            aria-busy={busy || undefined}
            className={className}
            {...props}
        >
            {busy ? <Spinner /> : <Glyph name="refresh" size={17} />}
        </Button>
    );
}
