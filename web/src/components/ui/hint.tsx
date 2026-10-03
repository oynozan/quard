"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";
import { usePortalContainer } from "./portal-container";

type HintProps = { content: ReactNode; children: ReactElement; side?: "top" | "bottom" | "left" | "right" };

// A short explanation shown while its control is hovered or focused. It needs no icon of its own.
export function Hint({ content, children, side = "top" }: HintProps) {
    const container = usePortalContainer();
    return (
        <Tooltip.Root>
            <Tooltip.Trigger render={children} delay={300} />
            <Tooltip.Portal container={container}>
                <Tooltip.Positioner side={side} sideOffset={8} collisionPadding={12} className="z-[100]">
                    <Tooltip.Popup className="max-w-[260px] rounded-sm bg-control-hover px-[10px] py-[7px] text-[12px] leading-[1.5] font-light text-ink-soft transition-opacity duration-[160ms] data-ending-style:opacity-0 data-starting-style:opacity-0">
                        {content}
                    </Tooltip.Popup>
                </Tooltip.Positioner>
            </Tooltip.Portal>
        </Tooltip.Root>
    );
}
