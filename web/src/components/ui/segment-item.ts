import { cn } from "@/lib/utils";

// Shared by segmented filters and tabs, neutral at rest and a raised tile with a green label when selected
export function segmentItem(size: "sm" | "md", selected: string): string {
    return cn(
        "inline-flex shrink-0 items-center gap-2 rounded-md border border-transparent whitespace-nowrap text-ink-2 select-none",
        "enabled:hover:bg-nav-hover enabled:hover:text-ink-bright",
        size === "sm"
            ? "h-8 px-[10px] text-[13px] max-[760px]:h-[34px]"
            : "min-h-[37px] px-[10px] py-[7px] text-[14px]",
        selected,
    );
}

// The selected state, written for whichever data attribute the primitive sets
export const SELECTED_PRESSED =
    "data-pressed:bg-selected data-pressed:text-signal enabled:data-pressed:hover:bg-selected enabled:data-pressed:hover:text-mint";
export const SELECTED_ACTIVE =
    "data-active:bg-selected data-active:text-signal enabled:data-active:hover:bg-selected enabled:data-active:hover:text-mint";
