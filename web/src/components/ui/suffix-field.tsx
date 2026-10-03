import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type SuffixFieldProps = ComponentProps<"input"> & { suffix: string; boxClassName?: string };

// One box holding an input and a fixed mono suffix, so the value reads as one string
export function SuffixField({ suffix, className, boxClassName, ...props }: SuffixFieldProps) {
    return (
        <label
            className={cn(
                "flex w-full cursor-text items-center gap-[10px] rounded-md border border-transparent bg-control px-3 focus-within:border-signal has-disabled:cursor-not-allowed has-disabled:opacity-45",
                boxClassName,
            )}
        >
            <input
                className={cn(
                    "mono field-sizing-content max-w-full min-w-[1ch] bg-transparent py-[11px] text-[15px] leading-[1.3] text-ink outline-none placeholder:text-ink-faint focus-visible:outline-none",
                    className,
                )}
                {...props}
            />
            <span className="mono shrink-0 text-[15px] leading-[1.3] text-ink-muted">{suffix}</span>
        </label>
    );
}
