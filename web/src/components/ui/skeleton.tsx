import { cn } from "@/lib/utils";

type SkeletonProps = { width?: number | string; height?: number; className?: string };

// A grey bar sized like the value it stands in for, never green
export function Skeleton({ width = 72, height = 12, className }: SkeletonProps) {
    return <span aria-hidden className={cn("skel", className)} style={{ width, height }} />;
}
