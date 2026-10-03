"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";
import { SELECTED_ACTIVE, segmentItem } from "./segment-item";

export { SegmentCount as TabCount } from "./segmented";

// Tabs that switch panels, selected like the nav item with a raised tile and a green label
export function Tabs(props: TabsPrimitive.Root.Props) {
    return <TabsPrimitive.Root {...props} />;
}

export function TabList({ className, ...props }: TabsPrimitive.List.Props) {
    return <TabsPrimitive.List className={cn("flex max-w-full flex-wrap items-center gap-1", className)} {...props} />;
}

export function Tab({ className, size = "md", ...props }: TabsPrimitive.Tab.Props & { size?: "sm" | "md" }) {
    return <TabsPrimitive.Tab className={cn(segmentItem(size, SELECTED_ACTIVE), className)} {...props} />;
}

export function TabPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
    return <TabsPrimitive.Panel className={cn("mt-[22px] outline-none", className)} {...props} />;
}
