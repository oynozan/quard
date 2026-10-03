"use client";

import { useEffect, useState } from "react";

// A container's width that survives the table view and ignores the 0 a detached node reports
export function useFitWidth<T extends HTMLElement>(initial: number) {
    const [node, setNode] = useState<T | null>(null);
    const [width, setWidth] = useState(initial);

    useEffect(() => {
        if (!node) return;
        const observer = new ResizeObserver(([entry]) => {
            const next = Math.floor(entry.contentRect.width);
            if (next > 0) setWidth(next);
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, [node]);

    return [setNode, width] as const;
}
