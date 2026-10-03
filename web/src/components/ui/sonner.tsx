"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// One flat bottom-right toaster, with its shadow, motion and focus overrides in globals.css
export function Toaster(props: ToasterProps) {
    return (
        <Sonner
            theme="dark"
            position="bottom-right"
            duration={2200}
            visibleToasts={1}
            swipeDirections={[]}
            style={
                {
                    "--normal-bg": "var(--surface)",
                    "--normal-text": "var(--ink)",
                    "--normal-border": "var(--line-strong)",
                    "--border-radius": "6px",
                } as CSSProperties
            }
            {...props}
        />
    );
}
