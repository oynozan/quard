import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyLineProps = {
    children: ReactNode;
    // Pads the line to the pane gutter, for use inside a Pane body
    inset?: boolean;
    className?: string;
};

// The one short line a page or section shows in place of its charts and tables when it has no data
export function EmptyLine({ children, inset = false, className }: EmptyLineProps) {
    return (
        <p
            role="status"
            className={cn(
                "text-[13px] leading-[1.6] font-light text-ink-muted",
                inset && "px-3 py-[14px] max-[760px]:px-[9px]",
                className,
            )}
        >
            {children}
        </p>
    );
}
