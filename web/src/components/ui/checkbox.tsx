"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type CheckboxProps = CheckboxPrimitive.Root.Props;

// A 16px box that turns Signal Green with a dark tick or bar when checked or mixed
export function Checkbox({ className, ...props }: CheckboxProps) {
    return (
        <CheckboxPrimitive.Root
            className={cn(
                "group relative inline-block size-4 shrink-0 rounded-sm border border-transparent bg-control-hover align-middle data-checked:border-signal data-checked:bg-signal data-disabled:cursor-not-allowed data-disabled:opacity-45 data-indeterminate:border-signal data-indeterminate:bg-signal",
                className,
            )}
            {...props}
        >
            <CheckboxPrimitive.Indicator className="absolute inset-0">
                <span className="absolute top-[2px] left-[5px] box-content h-[6px] w-[3px] rotate-45 border-r-[1.5px] border-b-[1.5px] border-on-signal group-data-indeterminate:hidden" />
                <span className="absolute top-[6px] right-[3px] left-[3px] hidden h-[2px] bg-on-signal group-data-indeterminate:block" />
            </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
    );
}

// A labelled checkbox in a form stack, 18px above the next row
export function CheckRow({ children, className, ...props }: CheckboxProps & { children: ReactNode }) {
    return (
        <label
            className={cn(
                "mb-[18px] flex w-fit cursor-pointer items-center gap-[9px] text-[14px] text-ink has-data-disabled:cursor-not-allowed has-data-disabled:text-ink-subtle",
                className,
            )}
        >
            <Checkbox {...props} />
            {children}
        </label>
    );
}

// The 32px hit area a table checkbox sits in, inside the 44px selection column
export function TableCheckbox({ className, ...props }: CheckboxProps) {
    return (
        <label className={cn("grid size-8 cursor-pointer place-items-center rounded-sm hover:bg-hover", className)}>
            <Checkbox {...props} />
        </label>
    );
}
