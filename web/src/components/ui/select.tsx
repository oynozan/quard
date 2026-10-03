"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Glyph } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { usePortalContainer } from "./portal-container";

export type SelectOption = { value: string; label: string; disabled?: boolean };

type SelectProps = {
    options: SelectOption[];
    value?: string | null;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    placeholder?: string;
    // "compact" is the 32px toolbar trigger, at most 160px wide
    size?: "default" | "compact";
    disabled?: boolean;
    name?: string;
    id?: string;
    "aria-label"?: string;
    className?: string;
};

const TRIGGER = {
    default: "min-h-[42px] w-full gap-4 bg-surface px-3 py-[10px] text-[14px] leading-5",
    compact: "min-h-8 w-auto max-w-[160px] gap-3 bg-nav-hover px-[9px] py-[5px] text-[12px] leading-5",
};

// A hairline trigger with a flat menu 6px below it, where Escape closes only the menu
export function Select({
    options,
    value,
    defaultValue,
    onValueChange,
    placeholder,
    size = "default",
    disabled,
    name,
    id,
    "aria-label": ariaLabel,
    className,
}: SelectProps) {
    const container = usePortalContainer();

    return (
        <SelectPrimitive.Root<string>
            items={options}
            value={value}
            defaultValue={defaultValue}
            onValueChange={(next) => {
                if (next !== null) onValueChange?.(next);
            }}
            disabled={disabled}
            name={name}
        >
            <SelectPrimitive.Trigger
                id={id}
                aria-label={ariaLabel}
                className={cn(
                    "flex min-w-0 items-center rounded-md border border-transparent bg-control-hover text-left text-ink select-none focus-visible:outline-offset-[3px] enabled:hover:bg-highlight data-popup-open:bg-highlight",
                    TRIGGER[size],
                    className,
                )}
            >
                <SelectPrimitive.Value
                    placeholder={placeholder}
                    className="min-w-0 flex-1 truncate data-placeholder:text-ink-faint"
                />
                <SelectPrimitive.Icon className="flex shrink-0 text-ink-muted">
                    <Glyph name="chevronDown" size={14} strokeWidth={2.4} />
                </SelectPrimitive.Icon>
            </SelectPrimitive.Trigger>

            <SelectPrimitive.Portal container={container}>
                <SelectPrimitive.Positioner
                    alignItemWithTrigger={false}
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    collisionPadding={8}
                    className="z-[100] outline-none"
                >
                    <SelectPrimitive.Popup className="flex max-h-[min(340px,var(--available-height))] max-w-[calc(100vw-16px)] min-w-[var(--anchor-width)] flex-col overflow-hidden rounded-md border border-line-strong bg-surface text-[13px] leading-[1.5] text-ink outline-none transition-opacity duration-[120ms] ease-out data-ending-style:opacity-0 data-starting-style:opacity-0">
                        <SelectPrimitive.ScrollUpArrow className="z-[1] flex h-6 w-full cursor-default items-center justify-center bg-surface text-ink-muted">
                            <Glyph name="chevronDown" size={14} strokeWidth={2.4} className="rotate-180" />
                        </SelectPrimitive.ScrollUpArrow>
                        <SelectPrimitive.List className="min-h-0 scroll-py-6 overflow-y-auto p-1">
                            {options.map((option) => (
                                <SelectPrimitive.Item
                                    key={option.value}
                                    value={option.value}
                                    disabled={option.disabled}
                                    className="relative flex min-h-[34px] cursor-default items-center rounded-[3px] py-[7px] pr-[34px] pl-[10px] outline-none select-none data-disabled:opacity-40 data-highlighted:bg-highlight data-highlighted:text-ink data-selected:not-data-highlighted:bg-tile"
                                >
                                    <SelectPrimitive.ItemText className="min-w-0 truncate">
                                        {option.label}
                                    </SelectPrimitive.ItemText>
                                    <SelectPrimitive.ItemIndicator className="absolute right-[9px] flex text-signal">
                                        <Glyph name="check" size={15} strokeWidth={2.4} />
                                    </SelectPrimitive.ItemIndicator>
                                </SelectPrimitive.Item>
                            ))}
                        </SelectPrimitive.List>
                        <SelectPrimitive.ScrollDownArrow className="z-[1] flex h-6 w-full cursor-default items-center justify-center bg-surface text-ink-muted">
                            <Glyph name="chevronDown" size={14} strokeWidth={2.4} />
                        </SelectPrimitive.ScrollDownArrow>
                    </SelectPrimitive.Popup>
                </SelectPrimitive.Positioner>
            </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
    );
}
