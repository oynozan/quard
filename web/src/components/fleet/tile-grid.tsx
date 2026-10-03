import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Panes tiled with one shared hairline between them, like a terminal split into windows
export function TileGrid({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn("grid gap-px border border-line bg-line", className)}>{children}</div>;
}

// Drops a tiled pane's own border so the grid's hairlines show once
export const TILE = "border-0";

// Two panes side by side, stacked at 900px and below
export const PAIR = "grid-cols-2 max-[900px]:grid-cols-1";
