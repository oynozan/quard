import type { LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// A block label 9px above its field
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
    return <label className={cn("mb-[9px] block text-[14px] leading-[1.55] text-ink", className)} {...props} />;
}
