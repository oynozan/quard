import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const FIELD =
    "block w-full min-w-0 rounded-md border border-transparent bg-control text-ink placeholder:text-ink-faint focus:border-field-focus disabled:cursor-not-allowed disabled:opacity-45";

type InputProps = ComponentProps<"input"> & {
    // The tighter field for inline add forms
    compact?: boolean;
    mono?: boolean;
};

// A flat filled field; a light edge and the green ring appear only on focus
export function Input({ className, compact, mono, type = "text", ...props }: InputProps) {
    return (
        <input
            type={type}
            className={cn(
                FIELD,
                compact ? "px-[11px] py-[9px] text-[13px]" : "px-3 py-[10px] text-[14px]",
                mono && "mono",
                className,
            )}
            {...props}
        />
    );
}

// The same box in Ubuntu Mono 13px, resizable vertically only
export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
    return (
        <textarea
            rows={rows}
            className={cn(FIELD, "mono resize-y px-3 py-[10px] text-[13px] leading-[1.55]", className)}
            {...props}
        />
    );
}
