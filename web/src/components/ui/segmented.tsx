"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { cn } from "@/lib/utils";
import { SELECTED_PRESSED, segmentItem } from "./segment-item";

export type SegmentOption = { value: string; label: string; count?: number; disabled?: boolean };

type SegmentedProps = {
    options: SegmentOption[];
    value: string;
    onValueChange: (value: string) => void;
    "aria-label": string;
    // "sm" fits the 32px toolbar row, "md" matches the 37px nav item
    size?: "sm" | "md";
    className?: string;
};

// A one-of-many filter that always keeps one option selected
export function Segmented({
    options,
    value,
    onValueChange,
    "aria-label": ariaLabel,
    size = "sm",
    className,
}: SegmentedProps) {
    return (
        <ToggleGroup
            value={[value]}
            onValueChange={(next) => {
                if (next.length > 0) onValueChange(next[next.length - 1]);
            }}
            aria-label={ariaLabel}
            className={cn("inline-flex max-w-full flex-wrap items-center gap-1", className)}
        >
            {options.map((option) => (
                <Toggle
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className={segmentItem(size, SELECTED_PRESSED)}
                >
                    {option.label}
                    {option.count !== undefined ? <SegmentCount value={option.count} /> : null}
                </Toggle>
            ))}
        </ToggleGroup>
    );
}

// A neutral mono count that never takes the green of the label beside it
export function SegmentCount({ value }: { value: number }) {
    return <span className="mono rounded-sm bg-tile px-[5px] text-[12px] leading-4 text-ink-note">{value}</span>;
}
